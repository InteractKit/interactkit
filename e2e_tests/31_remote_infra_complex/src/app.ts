import { graph } from '../interactkit/.generated/graph.js';

// In-memory DB adapter for testing
const store = new Map<string, Record<string, unknown>>();
const memoryDb = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({
  database: memoryDb,
  handlers: {
    Team: {
      run: async (entity, input) => {
        return entity.components.worker.process(input);
      },
      cacheSize: async (entity) => {
        return entity.components.cache.getSize();
      },
      workerStats: async (entity) => {
        return entity.components.worker.getProcessed();
      },
    },
    Worker: {
      process: async (entity, input) => {
        const cached = await entity.refs.cache.get({ key: input.key });
        if (cached.hit) {
          return { result: cached.value!, source: 'cache' };
        }
        const result = `${input.data.toUpperCase()}-${entity.state.processed}`;
        entity.state.processed++;
        await entity.refs.cache.put({ key: input.key, value: result });
        return { result, source: 'compute' };
      },
      getProcessed: async (entity) => {
        return { count: entity.state.processed };
      },
    },
    Cache: {
      get: async (entity, input) => {
        const val = (entity.state.store as Record<string, string>)?.[input.key];
        return { hit: val !== undefined, value: val ?? null };
      },
      put: async (entity, input) => {
        if (!entity.state.store || typeof entity.state.store !== 'object') {
          entity.state.store = {};
        }
        (entity.state.store as Record<string, string>)[input.key] = input.value;
        entity.state.size = Object.keys(entity.state.store).length;
        return { stored: true };
      },
      getSize: async (entity) => {
        return { size: entity.state.size };
      },
    },
  },
});

await app.boot();

console.log('[31] === Complex infra: Orchestrator -> 2 Teams -> Worker+Cache each ===');

// Phase 1: Sequential tasks to Team A
console.log('[31] Phase 1: Sequential tasks to Team A');
for (let i = 0; i < 10; i++) {
  const r = await app.teamA.run({ key: `a-${i}`, data: `task-${i}` });
  if (r.source !== 'compute') {
    console.error(`[31] FAIL: expected compute, got ${r.source}`);
    process.exit(1);
  }
}
const aStats = await app.teamA.workerStats();
console.log(`[31] Team A processed: ${aStats.count}`);

// Phase 2: Repeat same keys — should hit cache via ref
console.log('[31] Phase 2: Cache hits on Team A');
const r0 = await app.teamA.run({ key: 'a-0', data: 'task-0' });
console.log(`[31] repeat a-0: source=${r0.source}`);

// Phase 3: Parallel tasks across both teams
console.log('[31] Phase 3: Parallel across both teams');
const parallel = await Promise.all([
  ...Array.from({ length: 5 }, (_, i) => app.teamA.run({ key: `pa-${i}`, data: `parallel-a-${i}` })),
  ...Array.from({ length: 5 }, (_, i) => app.teamB.run({ key: `pb-${i}`, data: `parallel-b-${i}` })),
]);
console.log(`[31] parallel done: ${parallel.length} results`);

// Phase 4: Verify both teams have independent state
const aCacheSize = await app.teamA.cacheSize();
const bCacheSize = await app.teamB.cacheSize();
console.log(`[31] cache sizes: A=${aCacheSize.size}, B=${bCacheSize.size}`);

const bStats = await app.teamB.workerStats();
console.log(`[31] Team B processed: ${bStats.count}`);

console.log('[31] DONE');
await app.stop();
