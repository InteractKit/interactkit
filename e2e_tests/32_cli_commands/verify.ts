import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const cwd = import.meta.dirname;
const entities = join(cwd, 'src/entities');

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error(`  FAIL: ${msg}`); process.exit(1); }
  console.log(`  ok ${msg}`);
}

function read(file: string) { return readFileSync(join(entities, file), 'utf-8'); }
function run(cmd: string) { return execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' }); }

// Clean up any previous run
if (existsSync(entities)) rmSync(entities, { recursive: true });
if (existsSync(join(cwd, '.interactkit'))) rmSync(join(cwd, '.interactkit'), { recursive: true });
execSync('mkdir -p src/entities', { cwd });

try {
  // ─── Test 1: interactkit add (basic entity) ───────────
  console.log('[32] === Test 1: interactkit add MyAgent ===');
  run('interactkit add MyAgent');
  assert(existsSync(join(entities, 'my-agent.ts')), 'my-agent.ts created');

  const agent = read('my-agent.ts');
  assert(agent.includes('export class MyAgent extends BaseEntity'), 'class MyAgent extends BaseEntity');
  assert(agent.includes('@Entity({})'), '@Entity decorator');
  assert(agent.includes('@Hook(Init.Runner())'), 'has Init hook');
  assert(!agent.includes('RedisPubSubAdapter'), 'no RedisPubSubAdapter (local)');

  // ─── Test 2: interactkit add --remote ──────────────────
  console.log('[32] === Test 2: interactkit add Worker --remote ===');
  run('interactkit add Worker --remote');
  assert(existsSync(join(entities, 'worker.ts')), 'worker.ts created');

  const worker = read('worker.ts');
  assert(worker.includes('RedisPubSubAdapter'), 'has RedisPubSubAdapter import');
  assert(worker.includes('pubsub: RedisPubSubAdapter'), 'pubsub in @Entity');
  assert(worker.includes('export class Worker extends BaseEntity'), 'class Worker');

  // ─── Test 3: interactkit add --llm --remote ────────────
  console.log('[32] === Test 3: interactkit add Brain --llm --remote ===');
  run('interactkit add Brain --llm --remote');
  assert(existsSync(join(entities, 'brain.ts')), 'brain.ts created');

  const brain = read('brain.ts');
  assert(brain.includes('RedisPubSubAdapter'), 'LLM entity has RedisPubSubAdapter');
  assert(brain.includes('pubsub: RedisPubSubAdapter'), 'pubsub in LLM @Entity');
  assert(brain.includes('extends LLMEntity'), 'extends LLMEntity');
  assert(brain.includes('@Executor()'), 'has @Executor');

  // ─── Test 4: interactkit add (nested dot-path) ─────────
  console.log('[32] === Test 4: interactkit add MyAgent.Memory ===');
  run('interactkit add MyAgent.Memory');
  assert(existsSync(join(entities, 'my-agent/memory.ts')), 'nested memory.ts created');

  // ─── Test 5: interactkit add --llm (local) ─────────────
  console.log('[32] === Test 5: interactkit add Helper --llm ===');
  run('interactkit add Helper --llm');
  const helper = read('helper.ts');
  assert(!helper.includes('RedisPubSubAdapter'), 'local LLM has no RedisPubSubAdapter');
  assert(helper.includes('extends LLMEntity'), 'extends LLMEntity');

  // ─── Test 6: interactkit add Cache ─────────────────────
  console.log('[32] === Test 6: interactkit add Cache ===');
  run('interactkit add Cache');
  assert(existsSync(join(entities, 'cache.ts')), 'cache.ts created');

  // ─── Test 7: interactkit attach (always Remote<T>) ─────
  // attach always generates Remote<T> regardless of pubsub
  console.log('[32] === Test 7: interactkit attach Helper MyAgent ===');
  run('interactkit attach Helper MyAgent');

  const agentAfter7 = read('my-agent.ts');
  assert(agentAfter7.includes("import { Helper } from './helper.js';"), 'import Helper added');
  assert(agentAfter7.includes('@Component() private helper!: Remote<Helper>;'), '@Component always uses Remote<T>');
  assert(agentAfter7.includes('Component'), 'Component in imports');
  assert(agentAfter7.includes('type Remote'), 'Remote type imported');

  // ─── Test 8: interactkit attach more components to MyAgent ──
  console.log('[32] === Test 8: interactkit attach Worker & Cache to MyAgent ===');
  run('interactkit attach Worker MyAgent');
  run('interactkit attach Cache MyAgent');

  const agentAfter8 = read('my-agent.ts');
  assert(agentAfter8.includes('@Component() private worker!: Remote<Worker>;'), 'Worker attached as Remote');
  assert(agentAfter8.includes('@Component() private cache!: Remote<Cache>;'), 'Cache attached as Remote');

  // ─── Test 9: interactkit attach --ref ──
  console.log('[32] === Test 9: interactkit attach --ref ===');
  run('interactkit attach Cache Worker --ref');

  const workerAfter9 = read('worker.ts');
  assert(workerAfter9.includes("import { Cache } from './cache.js';"), 'import Cache added to Worker');
  assert(workerAfter9.includes('@Ref() private cache!: Remote<Cache>;'), '@Ref with Remote<T>');
  assert(workerAfter9.includes('type Remote'), 'Remote type imported');
  assert(workerAfter9.includes('Ref'), 'Ref in imports');

  // ─── Test 10: interactkit attach component on remote parent ──
  console.log('[32] === Test 10: interactkit attach component on remote parent ===');
  run('interactkit attach Cache Brain');

  const brainAfter10 = read('brain.ts');
  assert(brainAfter10.includes('@Component() private cache!: Remote<Cache>;'), '@Component with Remote on remote parent');

  // ─── Test 11: verify the project builds ────────────────
  // Remove LLM entities (need @langchain/openai which isn't installed here)
  // and Brain (not part of the tree anyway, just tested CLI add/attach)
  rmSync(join(entities, 'helper.ts'));
  rmSync(join(entities, 'brain.ts'));
  // Remove Helper component from MyAgent since we deleted helper.ts
  const agentForBuild = read('my-agent.ts')
    .replace(/import \{ Helper \}.*\n/, '')
    .replace(/.*@Component\(\) private helper!: Helper;.*\n/, '');
  writeFileSync(join(entities, 'my-agent.ts'), agentForBuild);

  console.log('[32] === Test 11: full build succeeds ===');
  run('interactkit build --root=src/entities/my-agent:MyAgent');
  assert(existsSync(join(cwd, '.interactkit/build')), 'build output exists');

  console.log('32_cli_commands: PASS');
} catch (e: any) {
  console.error('32_cli_commands: FAIL');
  if (e.stdout) console.error(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
  if (e.message) console.error(e.message);
  process.exit(1);
}
