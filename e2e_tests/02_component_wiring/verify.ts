import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['stored 30, count=30','search "entry-1": 11 results','getAll length: 30','counter: 12','after parallel: memory=33, counter=15','after clear: 0','["fresh"]','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('02_component_wiring: PASS');
} catch (e: any) { console.error('02: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
