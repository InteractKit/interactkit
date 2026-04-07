import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const cwd = import.meta.dirname;
const cliDist = resolve(cwd, '../../cli/dist/index.js');
const generated = join(cwd, 'interactkit/.generated');

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error(`  FAIL: ${msg}`); process.exit(1); }
  console.log(`  ok ${msg}`);
}

function read(file: string) { return readFileSync(join(generated, file), 'utf-8'); }

try {
  // ─── Test 1: compile produces output files ─────────────
  console.log('[32] === Test 1: interactkit compile produces files ===');
  execSync(`node ${cliDist} compile`, { stdio: 'pipe', cwd });

  assert(existsSync(join(generated, 'registry.ts')), 'registry.ts created');
  assert(existsSync(join(generated, 'types.ts')), 'types.ts created');
  assert(existsSync(join(generated, 'graph.ts')), 'graph.ts created');
  assert(existsSync(join(generated, 'tree.ts')), 'tree.ts created');
  assert(existsSync(join(generated, 'handlers.ts')), 'handlers.ts created (tools have src)');

  // ─── Test 2: registry.ts has correct entity names ──────
  console.log('[32] === Test 2: registry.ts entity names ===');
  const registry = read('registry.ts');
  assert(registry.includes("'my-agent'"), "registry has 'my-agent' entity");
  assert(registry.includes("'worker'"), "registry has 'worker' entity");
  assert(registry.includes("'cache'"), "registry has 'cache' entity");

  // ─── Test 3: registry.ts has correct tool method names ─
  console.log('[32] === Test 3: registry.ts tool names ===');
  assert(registry.includes('my-agent.dispatch'), 'registry has my-agent.dispatch method');
  assert(registry.includes('worker.process'), 'registry has worker.process method');
  assert(registry.includes('worker.getStats'), 'registry has worker.getStats method');
  assert(registry.includes('cache.get'), 'registry has cache.get method');
  assert(registry.includes('cache.put'), 'registry has cache.put method');

  // ─── Test 4: types.ts has correct interfaces ──────────
  console.log('[32] === Test 4: types.ts type interfaces ===');
  const types = read('types.ts');
  assert(types.includes('interface MyAgentEntity'), 'types has MyAgentEntity interface');
  assert(types.includes('interface WorkerEntity'), 'types has WorkerEntity interface');
  assert(types.includes('interface CacheEntity'), 'types has CacheEntity interface');
  assert(types.includes('interface MyAgentProxy'), 'types has MyAgentProxy interface');
  assert(types.includes('interface WorkerProxy'), 'types has WorkerProxy interface');
  assert(types.includes('interface CacheProxy'), 'types has CacheProxy interface');

  // ─── Test 5: types.ts has input/output types ──────────
  console.log('[32] === Test 5: types.ts input/output types ===');
  assert(types.includes('MyAgentDispatchInput'), 'types has MyAgentDispatchInput');
  assert(types.includes('WorkerProcessInput'), 'types has WorkerProcessInput');
  assert(types.includes('CachePutInput'), 'types has CachePutInput');

  // ─── Test 6: types.ts has handlers config ─────────────
  console.log('[32] === Test 6: types.ts HandlersConfig ===');
  assert(types.includes('HandlersConfig'), 'types has HandlersConfig');
  assert(types.includes('MyAgentHandlers'), 'types has MyAgentHandlers');
  assert(types.includes('WorkerHandlers'), 'types has WorkerHandlers');
  assert(types.includes('CacheHandlers'), 'types has CacheHandlers');

  // ─── Test 7: types.ts has component and ref wiring ────
  console.log('[32] === Test 7: types.ts component/ref wiring ===');
  assert(types.includes('components:'), 'types has components in entity');
  assert(types.includes('refs:'), 'types has refs in entity');

  // ─── Test 8: tree.ts has correct structure ────────────
  console.log('[32] === Test 8: tree.ts structure ===');
  const tree = read('tree.ts');
  assert(tree.includes('"my-agent"'), 'tree has my-agent as root');
  assert(tree.includes('"worker"'), 'tree has worker component');
  assert(tree.includes('"cache"'), 'tree has cache component');
  assert(tree.includes('className: "MyAgent"'), 'tree has MyAgent className');
  assert(tree.includes('className: "Worker"'), 'tree has Worker className');
  assert(tree.includes('className: "Cache"'), 'tree has Cache className');

  // ─── Test 9: graph.ts has app class with proxies ──────
  console.log('[32] === Test 9: graph.ts app class ===');
  const graphFile = read('graph.ts');
  assert(graphFile.includes('class App'), 'graph has App class');
  assert(graphFile.includes('InteractKitRuntime'), 'graph uses InteractKitRuntime');
  assert(graphFile.includes('MyAgentProxy'), 'graph has MyAgentProxy reference');

  // ─── Test 10: handlers.ts imports from src tool files ──
  console.log('[32] === Test 10: handlers.ts imports ===');
  const handlers = read('handlers.ts');
  assert(handlers.includes('worker-process'), 'handlers imports worker-process');
  assert(handlers.includes('cache-put'), 'handlers imports cache-put');
  assert(handlers.includes('HandlersConfig'), 'handlers references HandlersConfig');
  assert(handlers.includes('Worker'), 'handlers has Worker entity entry');
  assert(handlers.includes('Cache'), 'handlers has Cache entity entry');
  assert(handlers.includes('process:'), 'handlers maps process tool');
  assert(handlers.includes('put:'), 'handlers maps put tool');

  console.log('32_cli_commands: PASS');
} catch (e: any) {
  console.error('32_cli_commands: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  if (e.message) console.error(e.message);
  process.exit(1);
}
