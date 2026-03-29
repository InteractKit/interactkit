import { execSync, spawn } from 'child_process';

const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

const expected = [
  'http response:',
  '"ok":true',
  'first request: POST:/hook:{"msg":"hello"}',
  'DONE',
];

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  // 1. Start hook server first (needs to be ready before entities register)
  const hooks = spawn('node', ['.interactkit/build/src/_hooks.js'], { cwd, stdio: 'pipe' });
  pids.push(hooks.pid!);
  await new Promise(r => setTimeout(r, 2000));

  // 2. Start worker
  const worker = spawn('node', ['.interactkit/build/src/_unit-worker.js'], { cwd, stdio: 'pipe' });
  pids.push(worker.pid!);
  await new Promise(r => setTimeout(r, 2000));

  // 3. Start agent (runs onInit which sends HTTP requests)
  let output = '';
  try {
    output = execSync('node .interactkit/build/src/_unit-agent.js', { timeout: 15000, cwd }).toString();
  } catch (e: any) {
    output = e.stdout?.toString() ?? '';
    if (!output.includes('DONE')) throw e;
  }

  for (const exp of expected) {
    if (!output.includes(exp)) {
      console.error(`  FAIL: missing "${exp}"\n${output}`);
      process.exit(1);
    }
    console.log(`  ok ${exp}`);
  }
  console.log('30_remote_hooks: PASS');
} catch (e: any) {
  console.error('FAIL', e.stdout?.toString(), e.stderr?.toString());
  process.exit(1);
} finally {
  cleanup();
}
