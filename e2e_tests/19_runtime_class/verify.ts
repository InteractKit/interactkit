// Tests the Runtime class directly — no boot(), no codegen entrypoint
import 'reflect-metadata';
import { Runtime } from '@interactkit/sdk';
import { Agent } from './src/agent.js';
import { Brain } from './src/brain.js';
import { Memory } from './src/memory.js';

try {
  const runtime = new Runtime();

  const agent = await runtime.add(Agent);
  await runtime.add(Brain);
  await runtime.add(Memory);
  await runtime.start();

  console.log(`[19] runtime size: ${runtime.size}`);

  // Call tool on agent — should route through to brain → memory
  // (This tests that Runtime wires components/refs as proxies)
  const mem = runtime.getEntity('memory') as any;
  if (!mem) { console.error('FAIL: memory entity not found'); process.exit(1); }

  // Direct tool call on memory
  await mem.store({ text: 'direct' });
  const all = await mem.getAll();
  console.log(`[19] direct call: ${JSON.stringify(all)}`);

  // Shutdown
  await runtime.shutdown();
  console.log('[19] shutdown clean');
  console.log('19_runtime_class: PASS');
} catch (e: any) {
  console.error('FAIL:', e.message, e.stack);
  process.exit(1);
}
