import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['string: "hello" type=string','number: 42 type=number','boolean: true type=boolean','isNull=true','isUndef=true','"a":1,"b":{"c":2}','isArr=true','empty: {}','100 items, last=item-99','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('12_tool_return_types: PASS');
} catch (e: any) { console.error('12: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
