import { execSync, spawn } from 'child_process';
const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  // Start both services as separate processes
  const svcA = spawn('node', ['.interactkit/build/src/_unit-service-a.js'], { cwd, stdio: 'pipe' });
  const svcB = spawn('node', ['.interactkit/build/src/_unit-service-b.js'], { cwd, stdio: 'pipe' });
  pids.push(svcA.pid!, svcB.pid!);
  await new Promise(r => setTimeout(r, 2000));

  const output = execSync('node .interactkit/build/src/_unit-agent.js', { timeout: 20000, cwd }).toString();

  const expected = [
    '"from":"A","data":"HELLO"', '"from":"B","data":"olleh"',
    'A calls: 11, B calls: 11',
    'parallel: A=15, B=15',
    'final: A=26, B=26',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('16_distributed_bidirectional: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
