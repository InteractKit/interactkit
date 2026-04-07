import { execSync, spawn } from 'child_process';
import { resolve } from 'path';

const testDir = import.meta.dirname;
const cliDist = resolve(testDir, '../../cli/dist/index.js');
const workerDir = resolve(testDir, 'service-worker');
const gatewayDir = resolve(testDir, 'service-gateway');

const pids: number[] = [];
function cleanup() {
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

try {
  // 1. Compile the worker service
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd: workerDir });

  // 2. Start the worker service
  const worker = spawn('npx', ['tsx', 'src/app.ts'], {
    cwd: workerDir,
    stdio: 'pipe',
    env: { ...process.env },
  });
  pids.push(worker.pid!);

  // Wait for worker to be ready
  await new Promise<void>((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Worker boot timeout')), 10000);
    worker.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('[worker] ready')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    worker.stderr.on('data', (data) => {
      output += data.toString();
    });
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}: ${output}`));
    });
  });

  // 3. Compile the gateway (fetches /schema from running worker)
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd: gatewayDir });

  // 4. Run the gateway test
  const output = execSync('npx tsx src/app.ts', {
    timeout: 15000,
    cwd: gatewayDir,
  }).toString();

  const expected = [
    'single: DONE:HELLO',
    'sequential: processed=6, last=job-4',
    'parallel: 10 results',
    'all uppercase: true',
    'final: processed=16',
    'DONE',
  ];

  let pass = 0;
  for (const exp of expected) {
    if (!output.includes(exp)) {
      console.error(`  FAIL: missing "${exp}"\n${output}`);
      process.exit(1);
    }
    console.log(`  ok ${exp}`);
    pass++;
  }
  console.log(`33_remote_http: PASS (${pass}/${expected.length})`);
} catch (e: any) {
  console.error('33_remote_http: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  if (e.message) console.error(e.message);
  process.exit(1);
} finally {
  cleanup();
}
