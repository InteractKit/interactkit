import { execSync } from 'child_process';

const expected = [
  // Sequential
  '50 sequential increments: count=50',
  'after +10,+25,-5: count=80',
  // Parallel
  '20 parallel increments: count=100',
  // Logging
  '["first","second","third"]',
  // Return types
  '"nested":{"deep":true}',
  '[{"a":1},{"b":2}]',
  'string: hello world',
  'number: 42',
  'null: null',
  // Describe
  'Agent: 100 ops, 3 logs',
  'DONE',
];

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd: import.meta.dirname });
  const output = execSync('node .interactkit/build/src/_entry.js', {
    timeout: 15000, cwd: import.meta.dirname,
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
