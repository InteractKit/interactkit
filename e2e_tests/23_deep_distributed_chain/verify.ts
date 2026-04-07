import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

try {
  // Compile XML
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  // Run the app
  const output = execSync('npx tsx src/app.ts', { timeout: 30000, cwd }).toString();

  const expected = [
    'C(B(hello))', 'chain correct: true',
    '20 sequential done',
    'parallel: 10 results, all final: true',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('23_deep_distributed_chain: PASS');
} catch (e: any) {
  console.error('FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
