import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');
const gen = join(cwd, 'interactkit/.generated');

try {
  // Compile XML
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  // 1. Check registry.ts exists and has entity names
  const regPath = join(gen, 'registry.ts');
  if (!existsSync(regPath)) { console.error('FAIL: missing registry.ts'); process.exit(1); }
  const registry = readFileSync(regPath, 'utf-8');
  if (!registry.includes("'agent'")) { console.error('FAIL: registry missing agent'); process.exit(1); }
  console.log('  ok registry.ts has agent');
  if (!registry.includes("'memory'") || !registry.includes('memory.store')) {
    console.error('FAIL: registry missing memory'); process.exit(1);
  }
  console.log('  ok registry.ts has memory');

  // 2. Check types.ts exists and has interfaces
  const typesPath = join(gen, 'types.ts');
  if (!existsSync(typesPath)) { console.error('FAIL: missing types.ts'); process.exit(1); }
  const types = readFileSync(typesPath, 'utf-8');
  if (!types.includes('AgentProxy') && !types.includes('AgentHandlers')) {
    console.error('FAIL: types.ts missing Agent types'); process.exit(1);
  }
  console.log('  ok types.ts has Agent types');
  if (!types.includes('MemoryProxy') || !types.includes('MemoryHandlers')) {
    console.error('FAIL: types.ts missing Memory types'); process.exit(1);
  }
  console.log('  ok types.ts has Memory types');
  if (!types.includes('HandlersConfig')) {
    console.error('FAIL: types.ts missing HandlersConfig'); process.exit(1);
  }
  console.log('  ok types.ts has HandlersConfig');

  // 3. Check graph.ts exists and has InteractKitGraph class
  const graphPath = join(gen, 'graph.ts');
  if (!existsSync(graphPath)) { console.error('FAIL: missing graph.ts'); process.exit(1); }
  const graphSrc = readFileSync(graphPath, 'utf-8');
  if (!graphSrc.includes('InteractKitGraph')) {
    console.error('FAIL: graph.ts missing InteractKitGraph'); process.exit(1);
  }
  console.log('  ok graph.ts has InteractKitGraph');
  if (!graphSrc.includes('export const graph')) {
    console.error('FAIL: graph.ts missing graph export'); process.exit(1);
  }
  console.log('  ok graph.ts exports graph');

  // 4. Check tree.ts exists and has entityTree
  const treePath = join(gen, 'tree.ts');
  if (!existsSync(treePath)) { console.error('FAIL: missing tree.ts'); process.exit(1); }
  const tree = readFileSync(treePath, 'utf-8');
  if (!tree.includes('entityTree')) {
    console.error('FAIL: tree.ts missing entityTree'); process.exit(1);
  }
  console.log('  ok tree.ts has entityTree');
  if (!tree.includes('"agent"')) {
    console.error('FAIL: tree.ts missing agent entity'); process.exit(1);
  }
  console.log('  ok tree.ts has agent entity');
  if (!tree.includes('"memory"')) {
    console.error('FAIL: tree.ts missing memory entity'); process.exit(1);
  }
  console.log('  ok tree.ts has memory entity');

  // 5. Check component wiring in tree
  if (!tree.includes('components')) {
    console.error('FAIL: tree.ts missing components'); process.exit(1);
  }
  console.log('  ok tree.ts has components');

  // 6. Check methods in registry
  if (!registry.includes('memory.store')) {
    console.error('FAIL: registry missing memory.store method'); process.exit(1);
  }
  console.log('  ok registry has memory.store method');

  // 7. Verify codegen output is valid by actually running a simple app
  const output = execSync('npx tsx src/app.ts', { timeout: 15000, cwd }).toString();
  if (!output.includes('CODEGEN_OK')) {
    console.error('FAIL: app did not produce CODEGEN_OK\n' + output); process.exit(1);
  }
  console.log('  ok app runs with generated code');

  console.log('20_codegen_verification: PASS');
} catch (e: any) {
  console.error('FAIL:', e.message);
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  process.exit(1);
}
