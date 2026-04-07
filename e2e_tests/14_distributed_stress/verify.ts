import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

const expected = [
  'sequential: 200', 'after parallel: 300', '50 parallel reads consistent: true',
  'seq-0:true seq-199:true par-0:true par-99:true', 'DONE',
];

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 30000, cwd }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('14_distributed_stress: PASS');
} catch (e: any) {
  console.error('14_distributed_stress: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
