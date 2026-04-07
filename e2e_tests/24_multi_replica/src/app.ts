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
      doWork: async (entity, input) => {
        entity.state.handled++;
        await new Promise(r => setTimeout(r, Math.random() * 10));
        return { task: input.task, n: entity.state.handled };
      },
      stats: async (entity) => {
        return { handled: entity.state.handled };
      },
    },
  },
});

await app.boot();

console.log('[24] === 30 sequential tasks to worker ===');
const results: any[] = [];
for (let i = 0; i < 30; i++) {
  results.push(await app.worker.doWork({ task: `task-${i}` }));
}
console.log(`[24] sequential: ${results.length} tasks`);

console.log('[24] === 50 parallel tasks ===');
const parallel = await Promise.all(
  Array.from({ length: 50 }, (_, i) => app.worker.doWork({ task: `par-${i}` }))
);
console.log(`[24] parallel: ${parallel.length} tasks`);

// Verify all tasks were processed
const stats = await app.worker.stats();
console.log(`[24] total handled: ${stats.handled}`);
console.log(`[24] all processed: ${stats.handled === 80}`);

console.log('[24] DONE');
await app.stop();
