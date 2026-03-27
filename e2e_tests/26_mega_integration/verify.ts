import { execSync } from 'child_process';
const cwd = import.meta.dirname;

try {
  execSync('interactkit build --root=src/world:World', { stdio: 'pipe', cwd });

  // Single process (boot()) — all 10 entities in one process
  const output = execSync('node .interactkit/build/src/_entry.js', { timeout: 30000, cwd }).toString();

  const expected = [
    'Mega Integration: 10 entities',
    'Phase 1: Alpha processing',
    'alpha cache: hits=0, misses=15',
    'Phase 2: Beta processing',
    'Phase 3: Parallel both teams',
    'parallel: 40 results',
    'results stored: 70',
    'alpha format correct: true',
    'beta format correct: true',
    'repeat job-0: source=cache',
    'empty data: result="-ALPHA"',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }

  console.log('26_mega_integration: PASS');
} catch (e: any) {
  console.error('FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
