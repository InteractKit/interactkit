import { execSync, spawn } from 'child_process';

const cwd = import.meta.dirname;
const pids: number[] = [];

function cleanup() {
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

try {
  // Build
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  // Start Memory unit
  const mem = spawn('node', ['.interactkit/build/src/_unit-memory.js'], { cwd, stdio: 'pipe' });
  pids.push(mem.pid!);

  // Wait for it to boot
  await new Promise(r => setTimeout(r, 2000));

  // Start Agent unit, capture output
  const output = execSync('node .interactkit/build/src/_unit-agent.js', {
    timeout: 15000, cwd,
  }).toString();

  const expected = [
    'stored 20, count: 20',
    'search "item-1": 11 results',
    'getAll: 20 entries',
    'after 30 parallel: 50',
    'integrity: first=true, last=true',
    'DONE',
  ];

  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('13_distributed_basic: PASS');
} catch (e: any) {
  console.error('13_distributed_basic: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
} finally {
  cleanup();
}
