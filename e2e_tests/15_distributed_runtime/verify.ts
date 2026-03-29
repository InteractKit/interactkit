import { execSync, spawn } from 'child_process';
const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  const worker = spawn('node', ['.interactkit/build/src/_unit-worker.js'], { cwd, stdio: 'pipe' });
  pids.push(worker.pid!);
  await new Promise(r => setTimeout(r, 2000));

  const output = execSync('node .interactkit/build/src/_unit-agent.js', { timeout: 15000, cwd }).toString();

  const expected = ['worker id: agent.worker', 'DONE'];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('15_distributed_runtime: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
