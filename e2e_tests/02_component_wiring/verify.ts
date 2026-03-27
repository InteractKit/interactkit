import { execSync } from 'child_process';
const expected = [
  'stored 30, count=30',
  'search "entry-1": 11 results',
  'getAll length: 30',
  'counter: 12',
  'after parallel: memory=33, counter=15',
  'after clear: 0',
  '["fresh"]',
  'DONE',
];
try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd: import.meta.dirname });
  const output = execSync('node .interactkit/build/src/_entry.js', { timeout: 15000, cwd: import.meta.dirname }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('02_component_wiring: PASS');
} catch (e: any) { console.error('02_component_wiring: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
