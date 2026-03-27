import { execSync } from 'child_process';
const expected = [
  'after push 3: 3', 'after push 50 more: 53', 'popped: item-49, length: 52',
  'after unshift: [0]=first', 'shifted: first', 'after splice(0,5): length=47',
  '[1,2,3,5,8,9]', '[9,8,5,3,2,1]', '[0,0,0,0,0,0]', 'nums[2]: 42',
  '["fresh","start"]', 'DONE',
];
try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd: import.meta.dirname });
  const output = execSync('node .interactkit/build/src/_entry.js', { timeout: 15000, cwd: import.meta.dirname }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('06_state_array_mutations: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
