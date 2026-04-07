import { execSync } from 'child_process';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');

const expected = [
  'sensor data received: 20',
  'alarm data received: 10',
  'total sensor: 35',
  'total alarm: 20',
  'integrity: first=true, last=true, warn=true, crit=true',
  'DONE',
];

try {
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  const output = execSync('npx tsx src/app.ts', {
    timeout: 20000, cwd,
  }).toString();

  let pass = 0;
  for (const exp of expected) {
    if (output.includes(exp)) { pass++; console.log(`  ok ${exp}`); }
    else { console.error(`  FAIL: missing "${exp}"`); console.error(output); process.exit(1); }
  }

  // Verify store received forwarded events
  if (output.includes('remote store events: 0')) {
    console.error('  FAIL: remote store empty');
    process.exit(1);
  }
  console.log('  ok remote store received forwarded events');

  console.log(`27_streams_colocation: PASS (${pass}/${expected.length})`);
} catch (e: any) {
  console.error('27_streams_colocation: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
