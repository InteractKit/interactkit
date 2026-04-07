import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

const expected = [
  'stored 20, count: 20',
  'search "item-1": 11 results',
  'getAll: 20 entries',
  'after 30 parallel: 50',
  'integrity: first=true, last=true',
  'DONE',
];

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('13_distributed_basic: PASS');
} catch (e: any) {
  console.error('13_distributed_basic: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
