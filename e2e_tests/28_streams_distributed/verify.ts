import { execSync, spawn } from 'child_process';
const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  // Start Sensor in separate process
  const sensor = spawn('node', ['.interactkit/build/src/_unit-sensor.js'], { cwd, stdio: 'pipe' });
  pids.push(sensor.pid!);
  await new Promise(r => setTimeout(r, 2000));

  const output = execSync('node .interactkit/build/src/_unit-agent.js', { timeout: 20000, cwd }).toString();

  const expected = [
    'received: 10',
    '[0,10,20,30,40,50,60,70,80,90]',
    'batch received: 5',
    'parallel received: 20',
    'total: 35 values',
    'integrity: first=true, batch=true, parallel=true',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('28_streams_distributed: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
