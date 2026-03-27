import { execSync } from 'child_process';
const expected = [
  'A count: 10, B count: 5',
  'A has B entries: false', 'B has A entries: false',
  'final A: 30, final B: 25',
  'DONE',
];
try {
  execSync('interactkit build --root=src/world:World', { stdio: 'pipe', cwd: import.meta.dirname });
  const output = execSync('node .interactkit/build/src/_entry.js', { timeout: 15000, cwd: import.meta.dirname }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('07_multiple_same_type: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
