import { execSync, spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);

try {
  execSync('interactkit build --root=src/world:World', { stdio: 'pipe', cwd });

  // Verify deployment plan: Sensor+Alarm co-located with World, Store separate
  const plan = JSON.parse(readFileSync(join(cwd, '.interactkit/generated/deployment.json'), 'utf-8'));
  const worldUnit = plan.units.find((u: any) => u.entities.includes('world'));
  const sensorColocated = worldUnit?.entities.includes('sensor');
  const alarmColocated = worldUnit?.entities.includes('alarm');
  const storeSeparate = plan.units.some((u: any) => u.entities.includes('store') && !u.entities.includes('world'));
  console.log(`  co-location: sensor=${sensorColocated}, alarm=${alarmColocated}, store-separate=${storeSeparate}`);
  if (!sensorColocated || !alarmColocated) { console.error('FAIL: stream entities not co-located'); process.exit(1); }
  console.log('  ok stream entities co-located with parent');

  // Run distributed: Store in separate process, World+Sensor+Alarm together
  execSync('redis-cli flushall', { stdio: 'pipe' });
  const store = spawn('node', ['.interactkit/build/src/_unit-store.js'], { cwd, stdio: 'pipe' });
  pids.push(store.pid!);
  await new Promise(r => setTimeout(r, 2000));

  // Run the world unit (contains Sensor+Alarm co-located)
  const worldUnitName = worldUnit?.name ?? 'unit-world';
  const output = execSync(`node .interactkit/build/src/_${worldUnitName}.js`, { timeout: 20000, cwd }).toString();

  const expected = [
    'sensor data received: 20',
    'alarm data received: 10',
    'total sensor: 35',
    'total alarm: 20',
    'integrity: first=true, last=true, warn=true, crit=true',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }

  // Verify remote store received forwarded events
  if (output.includes('remote store events: 0')) {
    console.error('  FAIL: remote store empty');
    process.exit(1);
  }
  console.log('  ok remote store received forwarded events');

  console.log('27_streams_colocation: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
