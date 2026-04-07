import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = [
  'after push 3: 3', 'after push 50 more: 53', 'popped: item-49, length: 52',
  'after unshift: [0]=first', 'shifted: first', 'after splice(0,5): length=47',
  '[1,2,3,5,8,9]', '[9,8,5,3,2,1]', '[0,0,0,0,0,0]', 'nums[2]: 42',
  '["fresh","start"]', 'DONE',
];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('06_state_array_mutations: PASS');
} catch (e: any) { console.error('06: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
