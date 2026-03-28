import { execSync, spawn } from 'child_process';

const cwd = import.meta.dirname;
const env = { ...process.env, REDIS_HOST: 'localhost', REDIS_PORT: '6379' };
const pids: number[] = [];

function cleanup() {
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
}
process.on('exit', cleanup);

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  // Start Worker unit
  const worker = spawn('node', ['.interactkit/build/src/_unit-worker.js'], { cwd, env, stdio: 'pipe' });
  pids.push(worker.pid!);

  await new Promise(r => setTimeout(r, 2000));

  // Run Agent unit
  const output = execSync('node .interactkit/build/src/_unit-agent.js', {
    timeout: 15000, cwd, env,
  }).toString();

  const expected = [
    'after store: count=2',
    'function proxy: PASS',
    'class proxy: PASS',
    'recursive proxy: PASS',
    'curried proxy: PASS',
    'promise.all: PASS',
    'DONE',
  ];

  for (const exp of expected) {
    if (!output.includes(exp)) {
      console.error(`  FAIL: missing "${exp}"\n${output}`);
      process.exit(1);
    }
    console.log(`  ok ${exp}`);
  }

  console.log('29_proxy_functions: PASS');
} catch (e: any) {
  console.error('FAIL', e.stdout?.toString(), e.stderr?.toString());
  process.exit(1);
} finally {
  cleanup();
}
