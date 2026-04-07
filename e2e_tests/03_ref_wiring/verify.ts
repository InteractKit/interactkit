import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['after 2 thinks, memory count: 2','batch stored: 20, total: 22','recall count: 22','parent sees: 22','match: true','after 15 parallel thinks: 37','has first: true, has last: true','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('03_ref_wiring: PASS');
} catch (e: any) { console.error('03: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
