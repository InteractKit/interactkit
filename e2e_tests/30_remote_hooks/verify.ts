import { execSync } from 'child_process';

const cwd = import.meta.dirname;

const expected = [
  'worker booted',
  'worker received: POST /hook',
  'http response:',
  '"ok":true',
  'first request: POST:/hook:{"msg":"hello"}',
  'DONE',
];

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  // Run _all.js which starts entity units + hook server in one process
  let output = '';
  try {
    output = execSync('node .interactkit/build/src/_all.js', {
      timeout: 15000, cwd,
    }).toString();
  } catch (e: any) {
    // Process killed by timeout after DONE — expected since HTTP server keeps it alive
    output = e.stdout?.toString() ?? '';
    if (!output.includes('DONE')) throw e;
  }

  for (const exp of expected) {
    if (!output.includes(exp)) {
      console.error(`  FAIL: missing "${exp}"\n${output}`);
      process.exit(1);
    }
    console.log(`  ok ${exp}`);
  }
  console.log('30_remote_hooks: PASS');
} catch (e: any) {
  console.error('FAIL', e.stdout?.toString(), e.stderr?.toString());
  process.exit(1);
}
