import { execSync, spawn } from 'child_process';
const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

try {
  execSync('interactkit build --root=src/world:World', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  // Start D, C, B as separate processes (order matters: D first since C depends on D)
  const d = spawn('node', ['.interactkit/build/src/_unit-step-d.js'], { cwd, stdio: 'pipe' });
  pids.push(d.pid!);
  await new Promise(r => setTimeout(r, 1500));

  const c = spawn('node', ['.interactkit/build/src/_unit-step-c.js'], { cwd, stdio: 'pipe' });
  pids.push(c.pid!);
  await new Promise(r => setTimeout(r, 1500));

  const b = spawn('node', ['.interactkit/build/src/_unit-step-b.js'], { cwd, stdio: 'pipe' });
  pids.push(b.pid!);
  await new Promise(r => setTimeout(r, 1500));

  const output = execSync('node .interactkit/build/src/_unit-world.js', { timeout: 30000, cwd }).toString();

  const expected = [
    'C(B(hello))', 'chain correct: true',
    '20 sequential done',
    'parallel: 10 results, all final: true',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('23_deep_distributed_chain: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
