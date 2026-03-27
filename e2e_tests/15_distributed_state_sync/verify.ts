import { execSync, spawn } from 'child_process';
import { rmSync } from 'fs';
const cwd = import.meta.dirname;
const pids: number[] = [];
const dbUrl = `file:${cwd}/interactkit.db`;
const env = { ...process.env, DATABASE_URL: dbUrl };
function cleanup() {
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  for (const f of ['interactkit.db', 'interactkit.db-journal', 'prisma/interactkit.db', 'prisma/interactkit.db-journal']) {
    try { rmSync(`${cwd}/${f}`, { force: true }); } catch {}
  }
}
process.on('exit', cleanup);

try {
  cleanup();
  execSync('redis-cli flushall', { stdio: 'pipe' });
  execSync(`DATABASE_URL="${dbUrl}" npx prisma db push --accept-data-loss`, { cwd, stdio: 'pipe' });
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });

  const counter = spawn('node', ['.interactkit/build/src/_unit-counter.js'], { cwd, stdio: 'pipe', env });
  pids.push(counter.pid!);
  await new Promise(r => setTimeout(r, 3000));

  const output = execSync('node .interactkit/build/src/_unit-agent.js', { timeout: 20000, cwd, env }).toString();

  const expected = ['value: 55, history: 10', 'correct: true', 'after parallel: 75', 'DONE'];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('15_distributed_state_sync: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
