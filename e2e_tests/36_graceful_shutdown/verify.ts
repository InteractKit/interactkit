import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error(`  FAIL: ${msg}`); process.exit(1); }
  console.log(`  ok ${msg}`);
}

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();

  assert(output.includes('count: 3'), 'did work');
  assert(output.includes('health: ok'), 'health while running');
  assert(output.includes('server closed'), 'server closed cleanly');
  assert(output.includes('app stopped'), 'app stopped cleanly');
  assert(output.includes('server unreachable'), 'server down after close');
  assert(output.includes('DONE'), 'completed');

  console.log('36_graceful_shutdown: PASS');
} catch (e: any) {
  console.error('36_graceful_shutdown: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  if (e.message) console.error(e.message);
  process.exit(1);
}
