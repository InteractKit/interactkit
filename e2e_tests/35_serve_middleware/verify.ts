import { execSync, spawn } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error(`  FAIL: ${msg}`); cleanup(); process.exit(1); }
  console.log(`  ok ${msg}`);
}

async function req(path: string, opts?: { method?: string; body?: any; headers?: Record<string, string> }): Promise<{ status: number; data: any }> {
  const res = await fetch(`http://localhost:4300${path}`, {
    method: opts?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });
  const proc = spawn('npx', ['tsx', 'src/app.ts'], { cwd, stdio: 'pipe' });
  pids.push(proc.pid!);

  await new Promise<void>((resolve, reject) => {
    let out = '';
    const t = setTimeout(() => reject(new Error('Boot timeout')), 10000);
    proc.stdout.on('data', (d) => { out += d.toString(); if (out.includes('[35] server ready')) { clearTimeout(t); resolve(); } });
    proc.stderr.on('data', (d) => { out += d.toString(); });
    proc.on('exit', (c) => { if (c) reject(new Error(`Exit ${c}: ${out}`)); });
  });

  console.log('[35] === Health endpoint ===');
  const health = await req('/_health');
  assert(health.status === 200, `health status: ${health.status}`);
  assert(health.data.status === 'ok', `health body: ${health.data.status}`);
  assert(typeof health.data.uptime === 'number', `has uptime`);

  console.log('[35] === Auth middleware rejects ===');
  const noAuth = await req('/app/fast', { method: 'POST', body: { msg: 'test' } });
  assert(noAuth.status === 401, `no auth → 401: ${noAuth.status}`);
  assert(noAuth.data.error === 'Unauthorized', `error msg: ${noAuth.data.error}`);

  console.log('[35] === Auth middleware passes ===');
  const withAuth = await req('/app/fast', {
    method: 'POST',
    body: { msg: 'hello' },
    headers: { Authorization: 'Bearer test-secret' },
  });
  assert(withAuth.status === 200, `auth pass → 200: ${withAuth.status}`);
  assert(withAuth.data === 'ok:hello', `result: ${withAuth.data}`);

  console.log('[35] === Request timeout ===');
  const slow = await req('/app/slow', {
    method: 'GET',
    headers: { Authorization: 'Bearer test-secret' },
  });
  assert(slow.status === 504, `timeout → 504: ${slow.status}`);
  assert(slow.data.error === 'Request timeout', `timeout msg: ${slow.data.error}`);

  console.log('[35] === 404 for unknown route ===');
  const notFound = await req('/unknown', { headers: { Authorization: 'Bearer test-secret' } });
  assert(notFound.status === 404, `unknown → 404: ${notFound.status}`);

  console.log('[35] === Middleware logging ===');
  const log = await req('/log', { headers: { Authorization: 'Bearer test-secret' } });
  assert(log.status === 200, `log status: ${log.status}`);
  assert(Array.isArray(log.data) && log.data.length > 0, `log has entries: ${log.data.length}`);

  console.log('35_serve_middleware: PASS');
} catch (e: any) {
  console.error('35_serve_middleware: FAIL');
  if (e.message) console.error(e.message);
  process.exit(1);
} finally { cleanup(); }
