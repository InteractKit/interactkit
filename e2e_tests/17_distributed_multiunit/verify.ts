import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

const expected = [
  'db keys: 15, cache size: 15',
  'db k7: v7, cache k7: v7',
  'match: true',
  'DONE',
];

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 20000, cwd }).toString();

  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('17_distributed_multiunit: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
