import { execSync } from 'child_process';
const cwd = import.meta.dirname;
const cli = `node ${cwd}/../../cli/dist/index.js`;
const expected = ['count after assign: 42','name after assign: changed','"x":10,"y":20','count after 100 mutations: 99','count=99, name=changed','count after tool: 999','name after tool: tool-set','DONE'];
try {
  execSync(`${cli} compile`, { stdio: 'pipe', cwd });
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  for (const exp of expected) { if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); } console.log(`  ok ${exp}`); }
  console.log('05_state_reactivity: PASS');
} catch (e: any) { console.error('05: FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
