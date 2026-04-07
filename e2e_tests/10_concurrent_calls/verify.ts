import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['count after 50 parallel: 50','count after 100 more parallel: 150','final count: 153','has item-0: true, batch-99: true, rw-2: true','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 20000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('10_concurrent_calls: PASS');
} catch (e: any) { console.error('10: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
