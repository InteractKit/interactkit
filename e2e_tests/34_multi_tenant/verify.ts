import { execSync, spawn } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

const pids: number[] = [];
function cleanup() {
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error(`  FAIL: ${msg}`); cleanup(); process.exit(1); }
  console.log(`  ok ${msg}`);
}

async function rpc(tenant: string | null, entity: string, method: string, input?: any): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tenant) headers['x-tenant'] = tenant;
  const res = await fetch('http://localhost:4200/_rpc', {
    method: 'POST',
    headers,
    body: JSON.stringify({ entity, method, input }),
  });
  const data = await res.json() as any;
  if (data.error) throw new Error(data.error);
  return data.result;
}

try {
  // 1. Compile
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  // 2. Start server
  const proc = spawn('npx', ['tsx', 'src/app.ts'], { cwd, stdio: 'pipe' });
  pids.push(proc.pid!);

  // Wait for ready
  await new Promise<void>((resolve, reject) => {
    let out = '';
    const timeout = setTimeout(() => reject(new Error('Server boot timeout')), 10000);
    proc.stdout.on('data', (d) => {
      out += d.toString();
      if (out.includes('[34] server ready')) { clearTimeout(timeout); resolve(); }
    });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('exit', (code) => { if (code) reject(new Error(`Exit ${code}: ${out}`)); });
  });

  console.log('[34] === Multi-tenant isolation ===');

  // 3. Alice sends 3 messages
  const a1 = await rpc('alice', 'agent', 'agent.chat', { message: 'hello' });
  const a2 = await rpc('alice', 'agent', 'agent.chat', { message: 'world' });
  const a3 = await rpc('alice', 'agent', 'agent.chat', { message: 'test' });
  assert(a1.includes('echo: hello') && a1.includes('#1'), `alice msg 1: ${a1}`);
  assert(a3.includes('#3'), `alice msg 3: ${a3}`);

  // 4. Bob sends 1 message — should be independent
  const b1 = await rpc('bob', 'agent', 'agent.chat', { message: 'hi bob' });
  assert(b1.includes('#1'), `bob msg 1 (independent): ${b1}`);

  // 5. Verify counts are isolated
  const aliceCount = await rpc('alice', 'agent', 'agent.getCount', {});
  const bobCount = await rpc('bob', 'agent', 'agent.getCount', {});
  assert(aliceCount === 3, `alice count: ${aliceCount}`);
  assert(bobCount === 1, `bob count: ${bobCount}`);

  // 6. Verify memory is isolated
  const aliceMemory = await rpc('alice', 'agent.memory', 'memory.getAll', {});
  const bobMemory = await rpc('bob', 'agent.memory', 'memory.getAll', {});
  assert(aliceMemory.length === 3, `alice memory: ${aliceMemory.length} entries`);
  assert(bobMemory.length === 1, `bob memory: ${bobMemory.length} entries`);
  assert(!aliceMemory.includes('hi bob'), `alice doesn't have bob's data`);
  assert(!bobMemory.includes('hello'), `bob doesn't have alice's data`);

  // 7. Third tenant (charlie) — fresh state
  const c1 = await rpc('charlie', 'agent', 'agent.getCount', {});
  assert(c1 === 0, `charlie starts at 0: ${c1}`);

  // 8. No tenant header — uses parent app (shared)
  const noTenant = await rpc(null, 'agent', 'agent.chat', { message: 'shared' });
  assert(noTenant.includes('echo: shared'), `no tenant uses parent: ${noTenant}`);

  // 9. Parallel requests across tenants
  const parallel = await Promise.all([
    rpc('alice', 'agent', 'agent.chat', { message: 'par-a' }),
    rpc('bob', 'agent', 'agent.chat', { message: 'par-b' }),
    rpc('charlie', 'agent', 'agent.chat', { message: 'par-c' }),
    rpc('alice', 'agent', 'agent.chat', { message: 'par-a2' }),
    rpc('bob', 'agent', 'agent.chat', { message: 'par-b2' }),
  ]);
  assert(parallel.length === 5, `parallel: ${parallel.length} results`);

  // 10. Final counts after parallel
  const aliceFinal = await rpc('alice', 'agent', 'agent.getCount', {});
  const bobFinal = await rpc('bob', 'agent', 'agent.getCount', {});
  const charlieFinal = await rpc('charlie', 'agent', 'agent.getCount', {});
  assert(aliceFinal === 5, `alice final: ${aliceFinal}`);
  assert(bobFinal === 3, `bob final: ${bobFinal}`);
  assert(charlieFinal === 1, `charlie final: ${charlieFinal}`);

  console.log('34_multi_tenant: PASS');
} catch (e: any) {
  console.error('34_multi_tenant: FAIL');
  if (e.message) console.error(e.message);
  process.exit(1);
} finally {
  cleanup();
}
