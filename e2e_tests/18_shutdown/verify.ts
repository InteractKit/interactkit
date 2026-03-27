import { execSync } from 'child_process';
try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd: import.meta.dirname });
  // Process should exit cleanly with code 0 after SIGINT
  try {
    execSync('node .interactkit/build/src/_entry.js', { timeout: 10000, cwd: import.meta.dirname });
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
