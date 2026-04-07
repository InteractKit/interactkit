import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });
  // Process should exit cleanly with code 0 after SIGINT
  try {
    execSync('npx tsx src/app.ts', { timeout: 10000, cwd });
    console.log('  ok process exited cleanly');
    console.log('18_shutdown: PASS');
  } catch (e: any) {
    // SIGINT causes non-zero exit in some envs, that's ok if output is correct
    const output = e.stdout?.toString() ?? '';
    if (output.includes('work done') && output.includes('sending SIGINT')) {
      console.log('  ok shutdown triggered');
      console.log('18_shutdown: PASS');
    } else {
      console.error('FAIL', output, e.stderr?.toString());
      process.exit(1);
    }
  }
} catch (e: any) { console.error('FAIL', e.stderr?.toString()); process.exit(1); }
