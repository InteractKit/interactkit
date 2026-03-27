import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const cwd = import.meta.dirname;
const gen = join(cwd, '.interactkit/generated');

try {
  execSync('interactkit build --root=src/agent:Agent', { stdio: 'pipe', cwd });

  // Check deployment.json
  const plan = JSON.parse(readFileSync(join(gen, 'deployment.json'), 'utf-8'));
  console.log(`  units: ${plan.units.length}`);
  if (plan.units.length < 2) { console.error('FAIL: expected 2+ units'); process.exit(1); }
  console.log('  ok 2+ deployment units');

  const unitNames = plan.units.map((u: any) => u.name).sort();
  console.log(`  unit names: ${unitNames.join(', ')}`);

  // Check connections
  console.log(`  connections: ${plan.connections.length}`);
  if (plan.connections.length < 1) { console.error('FAIL: expected connections'); process.exit(1); }
  console.log('  ok has cross-unit connections');

  // Check generated entrypoints exist
  for (const unit of plan.units) {
    const path = join(gen, `_${unit.name}.ts`);
    if (!existsSync(path)) { console.error(`FAIL: missing ${path}`); process.exit(1); }
    console.log(`  ok ${unit.name} entrypoint`);
  }

  // Check _all.ts exists
  if (!existsSync(join(gen, '_all.ts'))) { console.error('FAIL: missing _all.ts'); process.exit(1); }
  console.log('  ok _all.ts');

  // Check _hooks.ts exists and has Tick (not Init since inProcess)
  const hooks = readFileSync(join(gen, '_hooks.ts'), 'utf-8');
  if (hooks.includes('Tick.Runner')) {
    console.log('  ok _hooks.ts has Tick');
  }
  if (hooks.includes('Init.Runner')) {
    console.error('FAIL: _hooks.ts should NOT have Init (inProcess)');
    process.exit(1);
  }
  console.log('  ok _hooks.ts excludes Init');

  // Check type-registry.ts exists and has entities
  const registry = readFileSync(join(gen, 'type-registry.ts'), 'utf-8');
  if (!registry.includes('agent') || !registry.includes('memory')) {
    console.error('FAIL: registry missing entities');
    process.exit(1);
  }
  console.log('  ok type-registry has entities');

  // Check scalable flag
  const memUnit = plan.units.find((u: any) => u.entities.includes('memory'));
  if (!memUnit?.scalable) { console.error('FAIL: memory unit should be scalable'); process.exit(1); }
  console.log('  ok memory unit is scalable');

  const agentUnit = plan.units.find((u: any) => u.entities.includes('agent'));
  if (agentUnit?.scalable) { console.error('FAIL: agent unit should not be scalable'); process.exit(1); }
  console.log('  ok agent unit is not scalable');

  console.log('20_codegen_verification: PASS');
} catch (e: any) { console.error('FAIL:', e.message); process.exit(1); }
