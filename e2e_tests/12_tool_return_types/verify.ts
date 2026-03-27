import { execSync } from 'child_process';
const expected = [
  'string: "hello" type=string', 'number: 42 type=number', 'boolean: true type=boolean',
  'isNull=true', 'isUndef=true', '"a":1,"b":{"c":2}',
  'isArr=true', 'empty: {}', '100 items, last=item-99', 'DONE',
];
try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd: import.meta.dirname });
  const output = execSync('node .interactkit/build/src/_entry.js', { timeout: 15000, cwd: import.meta.dirname }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('12_tool_return_types: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
