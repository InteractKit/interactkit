import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['A count: 10, B count: 5','A has B entries: false','B has A entries: false','final A: 30, final B: 25','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('07_multiple_same_type: PASS');
} catch (e: any) { console.error('07: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
