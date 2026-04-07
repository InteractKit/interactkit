import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['counter init: entityId=','counter set to 100 in init','agent init #1:','firstBoot=true','counter value after child init: 100','counter after increment: 105','agent initCalls: 1','["counter","agent"]','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('08_hooks_inprocess: PASS');
} catch (e: any) { console.error('08: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
