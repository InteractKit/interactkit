import { execSync } from 'child_process';
const cwd = import.meta.dirname;
try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });
  const output = execSync('node .interactkit/build/src/_entry.js', { timeout: 15000, cwd }).toString();

  const expected = [
    // Single emissions
    '[10,20,30]',
    // Lifecycle tracked per emit() call: each emit() does start+data+end
    '["START","END","START","END","START","END"]',
    // Batch: 5 more readings
    'readings after batch: 8',
    // Manual lifecycle
    'has start: true, has end: true',
    // Multi-child streams
    '["hello","world"]',
    // Rapid fire
    'rapid fire: 50 received',
    // Parallel
    'parallel: 20 received',
    // Total: 3 + 5 + 3 + 50 + 20 = 81
    'total readings: 81',
    'total logs: 2',
    'DONE',
  ];
  for (const exp of expected) {
    if (!output.includes(exp)) { console.error(`  FAIL: missing "${exp}"\n${output}`); process.exit(1); }
    console.log(`  ok ${exp}`);
  }
  console.log('11_streams: PASS');
} catch (e: any) { console.error('FAIL', e.stdout?.toString(), e.stderr?.toString()); process.exit(1); }
