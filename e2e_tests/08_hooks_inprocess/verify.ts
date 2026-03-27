import { execSync } from 'child_process';
const expected = [
  'counter init: entityId=',
  'counter set to 100 in init',
  'agent init #1:',
  'firstBoot=true',
  'counter value after child init: 100',
  'counter after increment: 105',
  'agent initCalls: 1',
  'DONE',
];
try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd: import.meta.dirname });
  const output = execSync('node .interactkit/build/src/_entry.js', { timeout: 15000, cwd: import.meta.dirname }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('08_hooks_inprocess: PASS');
} catch (e: any) { console.error('08_hooks_inprocess: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
