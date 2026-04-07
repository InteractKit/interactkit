import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['[10,20,30]','readings after batch: 8','["hello","world"]','rapid fire: 50 received','parallel: 20 received','total readings: 78','total logs: 2','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('11_streams: PASS');
} catch (e: any) { console.error('11: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
