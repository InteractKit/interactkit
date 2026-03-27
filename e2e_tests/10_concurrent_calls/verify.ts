import { execSync } from 'child_process';
const expected = [
  'count after 50 parallel: 50',
  'count after 100 more parallel: 150',
  'final count: 153',
  'has item-0: true, batch-99: true, rw-2: true',
  'DONE',
];
try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd: import.meta.dirname });
  const output = execSync('node .interactkit/build/src/_entry.js', { timeout: 20000, cwd: import.meta.dirname }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('10_concurrent_calls: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
