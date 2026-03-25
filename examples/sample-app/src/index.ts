import { boot } from '@interactkit/sdk';
import { Agent } from './entities/agent.js';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    failed++;
  }
}

async function main() {
  console.log('=== InteractKit Sample App ===\n');

  // ─── Boot ──────────────────────────────────────────────
  console.log('Booting Agent entity tree...');
  const ctx = await boot(Agent);
  const agent = ctx.root as Agent;

  console.log(`\nEntity tree: ${ctx.entities.size} entities`);
  for (const [id, inst] of ctx.entities) {
    console.log(`  ${inst.type}: ${id}`);
  }

  // ─── Test 1: Entity tree structure ─────────────────────
  console.log('\n--- 1. Entity Tree ---\n');
  assert('Root is agent', agent.id.startsWith('agent:'));
  assert('5 entities total', ctx.entities.size === 5);

  const types = [...ctx.entities.values()].map(e => e.type).sort();
  assert('Has brain', types.includes('brain'));
  assert('Has mouth', types.includes('mouth'));
  assert('Has memory', types.includes('memory'));
  assert('Has sensor', types.includes('sensor'));

  // ─── Test 2: Direct method calls ───────────────────────
  console.log('\n--- 2. Direct Methods ---\n');
  const intro = await agent.introduce();
  assert('introduce() returns greeting', intro === "Hi, I'm Atlas!");

  // ─── Test 3: Parent → child calls ─────────────────────
  console.log('\n--- 3. Parent → Child Calls ---\n');
  const reading = await agent.readSensor();
  assert('sensor.read() returns number', typeof reading === 'number' && reading >= 0 && reading <= 100);

  // ─── Test 4: Sibling calls via EntityRef ──────────────
  console.log('\n--- 4. Sibling Calls (EntityRef) ---\n');
  // brain.thinkAndSpeak → stores in memory (sibling) + speaks via mouth (sibling)
  const thought = await agent.ask({ question: 'What is consciousness?' });
  assert('thinkAndSpeak returns response', thought.includes('consciousness'));
  console.log(`  Response: ${thought}`);

  // Verify Brain → Memory sibling call worked
  const memories = await (agent as any).brain.reflect();
  assert('Brain stored thought in Memory (sibling ref)', memories.length === 1);
  assert('Memory contains the thought', memories[0]?.includes('consciousness'));

  // Verify Brain → Mouth sibling call worked
  const mouthHistory = await (agent as any).mouth.getHistory();
  assert('Brain spoke via Mouth (sibling ref)', mouthHistory.length === 1);

  // ─── Test 5: Multiple sibling calls ───────────────────
  console.log('\n--- 5. Multiple Calls ---\n');
  await agent.ask({ question: 'What is time?' });
  await agent.ask({ question: 'What is space?' });

  const allMemories = await (agent as any).brain.reflect();
  assert('Memory has 3 entries after 3 thinks', allMemories.length === 3);

  const allSpeech = await (agent as any).mouth.getHistory();
  assert('Mouth has 3 entries after 3 speaks', allSpeech.length === 3);

  // ─── Test 6: Memory search ────────────────────────────
  console.log('\n--- 6. Memory Search ---\n');
  const found = await (agent as any).memory.search({ query: 'time' });
  assert('Memory search finds "time"', found.length === 1);

  const notFound = await (agent as any).memory.search({ query: 'nonexistent' });
  assert('Memory search returns empty for no match', notFound.length === 0);

  const count = await (agent as any).memory.count();
  assert('Memory count is 3', count === 3);

  // ─── Test 7: Error propagation ────────────────────────
  console.log('\n--- 7. Error Propagation ---\n');
  try {
    // Call a method that doesn't exist
    await (agent as any).brain.nonExistentMethod();
    assert('Should have thrown', false);
  } catch (err: any) {
    assert('Error propagates from child', err.message.includes('Method not found'));
  }

  // ─── Test 8: LLM Execution Trigger ─────────────────────
  console.log('\n--- 8. LLM Execution Trigger ---\n');

  // Direct response (no tool call)
  const chatResult = await (agent as any).brain.chat({ message: 'Hello there!' });
  assert('LLM returns response', typeof chatResult === 'string' && chatResult.length > 0);
  console.log(`  Response: ${chatResult}`);

  // Trigger a tool call (message contains "think")
  const thinkResult = await (agent as any).brain.chat({ message: 'Please think about philosophy' });
  assert('LLM triggers tool call and returns', typeof thinkResult === 'string' && thinkResult.length > 0);
  console.log(`  Response: ${thinkResult}`);

  // Verify the tool call stored in memory
  const postLLMMemories = await (agent as any).brain.reflect();
  assert('LLM tool call stored in memory', postLLMMemories.length > 3); // 3 from earlier + new ones

  // ─── Summary ──────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  await ctx.shutdown();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
