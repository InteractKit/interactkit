import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

const expected = ['alpha:test', 'beta:test', 'gamma:test', 'all 3 responded', 'DONE'];

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();

  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('19_distributed_multiunit: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
