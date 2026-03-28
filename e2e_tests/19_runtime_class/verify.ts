import { execSync } from 'child_process';

const cwd = import.meta.dirname;

const expected = [
  'direct call:',     // memory.store + getAll works
  '"direct"',         // the stored value
  'shutdown clean',
];

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  const output = execSync('node .interactkit/build/src/_entry.js', {
    timeout: 15000, cwd,
  }).toString();

  for (const exp of expected) {
    if (!output.includes(exp)) {
      console.error(`  FAIL: missing "${exp}"\n${output}`);
      process.exit(1);
    }
    console.log(`  ok ${exp}`);
  }
  console.log('19_runtime_class: PASS');
} catch (e: any) {
  console.error('FAIL', e.stdout?.toString(), e.stderr?.toString());
  process.exit(1);
}
