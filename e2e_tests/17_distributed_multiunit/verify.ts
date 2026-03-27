import { execSync, spawn } from 'child_process';
const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

try {
  execSync('interactkit build --root=src/world:World', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  // Start db and cache as separate processes
  const db = spawn('node', ['.interactkit/build/src/_unit-db.js'], { cwd, stdio: 'pipe' });
  const cache = spawn('node', ['.interactkit/build/src/_unit-cache.js'], { cwd, stdio: 'pipe' });
  pids.push(db.pid!, cache.pid!);
  await new Promise(r => setTimeout(r, 2000));

  const output = execSync('node .interactkit/build/src/_unit-world.js', { timeout: 20000, cwd }).toString();

  const expected = [
    'db keys: 15, cache size: 15',
    'db k7: v7, cache k7: v7',
    'match: true',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('17_distributed_multiunit: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
