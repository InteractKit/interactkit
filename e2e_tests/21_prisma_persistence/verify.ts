import { execSync } from 'child_process';
import { rmSync, writeFileSync } from 'fs';
const cwd = import.meta.dirname;
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
  execSync(`DATABASE_URL="${dbUrl}" npx prisma db push --accept-data-loss`, { cwd, stdio: 'pipe' });
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });

  // Custom entry using Runner with PrismaDatabaseAdapter
  writeFileSync(`${cwd}/.interactkit/build/src/_test.js`,
    [
      `import 'dotenv/config';`,
      `import 'reflect-metadata';`,
      `import { Runner, InProcessBusAdapter, PrismaDatabaseAdapter } from '@interactkit/sdk';`,
      `import { entityTree } from './entity-tree.js';`,
      `import { Agent } from './agent.js';`,
      `const runner = new Runner(entityTree, {`,
      `  pubsubs: [{ name: 'InProcessBusAdapter', adapter: new InProcessBusAdapter() }],`,
      `  databases: [{ name: 'PrismaDatabaseAdapter', adapter: new PrismaDatabaseAdapter() }],`,
      `  loggers: [],`,
      `});`,
      `const { root, shutdown } = await runner.boot(Agent);`,
    ].join('\n')
  );

  // First boot
  const out1 = execSync(`node .interactkit/build/src/_test.js`, { timeout: 10000, cwd, env }).toString();
  if (!out1.includes('FIRST_DONE')) { console.error('FAIL: first boot\n' + out1); process.exit(1); }
  console.log('  ok first boot');

  // Verify DB — entity ID is now path-based: "agent"
  const db = execSync(`sqlite3 "${dbPath}" "SELECT state FROM EntityState WHERE id='agent'"`, { cwd }).toString();
  if (!db.includes('"count":42')) { console.error('FAIL: DB missing state\n' + db); process.exit(1); }
  console.log('  ok state in DB');

  // Second boot: state restored
  const out2 = execSync(`node .interactkit/build/src/_test.js`, { timeout: 10000, cwd, env }).toString();
  if (!out2.includes('REBOOT: count=42')) { console.error('FAIL: not restored\n' + out2); process.exit(1); }
  console.log('  ok state restored');
  if (!out2.includes('"first","second","third"')) { console.error('FAIL: array not restored\n' + out2); process.exit(1); }
  console.log('  ok array restored');

  console.log('21_prisma_persistence: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
finally { cleanup(); }
