import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

const expected = [
  'Mega Integration: 10 entities',
  'Phase 1: Alpha processing',
  'alpha cache: hits=0, misses=15',
  'Phase 2: Beta processing',
  'Phase 3: Parallel both teams',
  'parallel: 40 results',
  'results stored: 70',
  'alpha format correct: true',
  'beta format correct: true',
  'repeat job-0: source=cache',
  'empty data: result="-ALPHA"',
  'DONE',
];

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  const output = execSync('npx tsx src/app.ts', {
    timeout: 30000, cwd,
  }).toString();

  let pass = 0;
  for (const exp of expected) {
    if (output.includes(exp)) { pass++; console.log(`  ok ${exp}`); }
    else { console.error(`  FAIL: missing "${exp}"`); console.error(output); process.exit(1); }
  }
  console.log(`26_mega_integration: PASS (${pass}/${expected.length})`);
} catch (e: any) {
  console.error('26_mega_integration: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
