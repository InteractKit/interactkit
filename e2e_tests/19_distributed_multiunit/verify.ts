import { execSync, spawn } from 'child_process';
const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

try {
  execSync('interactkit build --root=src/world:World', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  const alpha = spawn('node', ['.interactkit/build/src/_unit-alpha.js'], { cwd, stdio: 'pipe' });
  pids.push(alpha.pid!);
  const beta = spawn('node', ['.interactkit/build/src/_unit-beta.js'], { cwd, stdio: 'pipe' });
  pids.push(beta.pid!);
  const gamma = spawn('node', ['.interactkit/build/src/_unit-gamma.js'], { cwd, stdio: 'pipe' });
  pids.push(gamma.pid!);
  await new Promise(r => setTimeout(r, 2000));

  const output = execSync('node .interactkit/build/src/_unit-world.js', { timeout: 15000, cwd }).toString();

  const expected = ['alpha:test', 'beta:test', 'gamma:test', 'all 3 responded', 'DONE'];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('19_distributed_multiunit: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
