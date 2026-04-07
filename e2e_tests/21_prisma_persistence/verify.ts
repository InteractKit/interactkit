import { execSync } from 'child_process';
import { rmSync } from 'fs';
import { resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');
const dbPath = `${cwd}/interactkit.db`;
const dbUrl = `file:${dbPath}`;
const env = { ...process.env, DATABASE_URL: dbUrl };

function cleanup() {
  for (const f of ['interactkit.db', 'interactkit.db-journal', 'prisma/interactkit.db', 'prisma/interactkit.db-journal']) {
    try { rmSync(`${cwd}/${f}`, { force: true }); } catch {}
  }
}
process.on('exit', cleanup);

try {
  cleanup();

  // Push prisma schema
  execSync(`DATABASE_URL="${dbUrl}" npx prisma db push --accept-data-loss`, { cwd, stdio: 'pipe' });

  // Compile XML
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  // First boot
  const out1 = execSync('npx tsx src/app.ts first', { timeout: 15000, cwd, env }).toString();
  if (!out1.includes('FIRST_DONE')) { console.error('FAIL: first boot\n' + out1); process.exit(1); }
  console.log('  ok first boot');

  // Verify DB — entity ID is "agent"
  const db = execSync(`sqlite3 "${dbPath}" "SELECT state FROM EntityState WHERE id='agent'"`, { cwd }).toString();
  if (!db.includes('"count":42')) { console.error('FAIL: DB missing state\n' + db); process.exit(1); }
  console.log('  ok state in DB');

  // Second boot: state restored
  const out2 = execSync('npx tsx src/app.ts reboot', { timeout: 15000, cwd, env }).toString();
  if (!out2.includes('REBOOT: count=42')) { console.error('FAIL: not restored\n' + out2); process.exit(1); }
  console.log('  ok state restored');
  if (!out2.includes('"first","second","third"')) { console.error('FAIL: array not restored\n' + out2); process.exit(1); }
  console.log('  ok array restored');

  console.log('21_prisma_persistence: PASS');
} catch (e: any) {
  console.error('FAIL', e.message);
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
} finally {
  cleanup();
}
