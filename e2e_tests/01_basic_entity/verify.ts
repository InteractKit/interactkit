import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

const expected = [
  '50 sequential increments: count=50',
  'after +10,+25,-5: count=80',
  '20 parallel increments: count=100',
  '["first","second","third"]',
  '"nested":{"deep":true}',
  '[{"a":1},{"b":2}]',
  'string: hello world',
  'number: 42',
  'null: null',
  'Agent: 100 ops, 3 logs',
  'DONE',
];

try {
  // Compile XML → interactkit/
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  // Run the app
  const output = execSync('npx tsx src/app.ts', {
    timeout: 15000, cwd,
  }).toString();

  let pass = 0;
  for (const exp of expected) {
    if (output.includes(exp)) { pass++; console.log(`  ok ${exp}`); }
    else { console.error(`  FAIL: missing "${exp}"`); console.error(output); process.exit(1); }
  }
  console.log(`01_basic_entity: PASS (${pass}/${expected.length})`);
} catch (e: any) {
  console.error('01_basic_entity: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
