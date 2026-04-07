import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['BOOM: test-error','has correct message: true','caught 5/5 errors','Error code 404','parallel: 10/10 rejected','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('09_error_propagation: PASS');
} catch (e: any) { console.error('09: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
