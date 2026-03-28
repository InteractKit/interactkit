import { execSync, spawn } from 'child_process';
const cwd = import.meta.dirname;
const pids: number[] = [];
function cleanup() { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } }
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

try {
  execSync('interactkit build --root=src/orchestrator:Orchestrator', { stdio: 'pipe', cwd });
  execSync('redis-cli flushall', { stdio: 'pipe' });

  // Find all unit files
  const unitFiles = execSync('ls .interactkit/build/src/_unit-*.js', { cwd, encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);

  console.log(`  units found: ${unitFiles.length}`);
  for (const f of unitFiles) console.log(`    ${f}`);

  // Start all non-orchestrator units as background processes (leaves first)
  const bgUnits = unitFiles.filter(f => !f.includes('orchestrator')).reverse();
  for (const unit of bgUnits) {
    const p = spawn('node', [unit], { cwd, stdio: 'pipe' });
    pids.push(p.pid!);
  }

  // Wait for all units to boot
  await new Promise(r => setTimeout(r, 3000));

  // Run the orchestrator unit (foreground, captures output)
  const orchUnit = unitFiles.find(f => f.includes('orchestrator'));
  if (!orchUnit) { console.error('FAIL: no orchestrator unit'); process.exit(1); }
  const output = execSync(`node ${orchUnit}`, { timeout: 30000, cwd }).toString();

  const expected = [
    'Team A processed: 10',
    'repeat a-0: source=cache',
    'parallel done: 10 results',
    'Team B processed: 5',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }

  console.log('31_remote_infra_complex: PASS');
} catch (e: any) {
  console.error('31_remote_infra_complex: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
} finally { cleanup(); }
