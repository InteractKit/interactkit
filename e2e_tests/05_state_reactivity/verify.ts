import { execSync } from 'child_process';
const expected = [
  'count after assign: 42', 'name after assign: changed',
  '"x":10,"y":20', 'count after 100 mutations: 99',
  'count=99, name=changed', 'count after tool: 999', 'name after tool: tool-set', 'DONE',
];
try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd: import.meta.dirname });
  const output = execSync('node .interactkit/build/src/_entry.js', { timeout: 15000, cwd: import.meta.dirname }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('05_state_reactivity: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
