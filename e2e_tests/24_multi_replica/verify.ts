import { execSync, spawn } from 'child_process';
const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  // Start 3 replicas of the Worker entity
  for (let i = 0; i < 3; i++) {
    const w = spawn('node', ['.interactkit/build/src/_unit-worker.js'], { cwd, stdio: 'pipe' });
    pids.push(w.pid!);
  }
  await new Promise(r => setTimeout(r, 2000));

  const output = execSync('node .interactkit/build/src/_unit-agent.js', { timeout: 30000, cwd }).toString();

  const expected = [
    'sequential: 30 tasks',
    'parallel: 50 tasks',
    'distributed: true',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }

  const match = output.match(/total unique pids: (\d+)/);
  if (match) console.log(`  ok ${match[1]} replicas handled tasks`);

  console.log('24_multi_replica: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
