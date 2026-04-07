import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const memoryDb = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({
  database: memoryDb,
  handlers: {
    Worker: {
      process: async (entity, input) => {
        entity.state.processed++;
        // Simulate work
        await new Promise(r => setTimeout(r, 5));
        return { worker: entity.id, data: input.data.toUpperCase(), n: entity.state.processed };
      },
      stats: async (entity) => {
        return { processed: entity.state.processed };
      },
    },
  },
});

await app.boot();

console.log('[22] === Sequential calls ===');
for (let i = 0; i < 50; i++) {
  await app.worker.process({ data: `job-${i}` });
}
let stats = await app.worker.stats();
console.log(`[22] sequential: ${stats.processed}`);

console.log('[22] === Parallel fanout (100 calls) ===');
const start = Date.now();
const results = await Promise.all(
  Array.from({ length: 100 }, (_, i) => app.worker.process({ data: `par-${i}` }))
);
const elapsed = Date.now() - start;
console.log(`[22] parallel 100: ${results.length} results in ${elapsed}ms`);

// Verify all results came back
const allUppercase = results.every(r => r.data === r.data.toUpperCase());
console.log(`[22] all uppercase: ${allUppercase}`);

stats = await app.worker.stats();
console.log(`[22] total processed: ${stats.processed}`);

console.log('[22] === Burst: 200 rapid-fire ===');
const burst = await Promise.all(
  Array.from({ length: 200 }, (_, i) => app.worker.process({ data: `burst-${i}` }))
);
const finalStats = await app.worker.stats();
console.log(`[22] burst results: ${burst.length}`);
console.log(`[22] final processed: ${finalStats.processed}`);

console.log('[22] DONE');
await app.stop();
