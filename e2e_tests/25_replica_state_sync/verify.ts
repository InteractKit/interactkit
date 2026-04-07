import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

const expected = [
  'all found: true',
  'getAll: 5 settings',
  'synced: true',
  'DONE',
];

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  const output = execSync('npx tsx src/app.ts', {
    timeout: 15000, cwd,
  }).toString();

  let pass = 0;
  for (const exp of expected) {
    if (output.includes(exp)) { pass++; console.log(`  ok ${exp}`); }
    else { console.error(`  FAIL: missing "${exp}"`); console.error(output); process.exit(1); }
  }
  console.log(`25_replica_state_sync: PASS (${pass}/${expected.length})`);
} catch (e: any) {
  console.error('25_replica_state_sync: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
