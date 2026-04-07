import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['10 tasks delegated through 5 levels','audit logs count: 10','has first: true, has last: true','parallel job numbers: 10 results','final log count: 20','has parallel logs: true','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('04_nested_depth: PASS');
} catch (e: any) { console.error('04: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
