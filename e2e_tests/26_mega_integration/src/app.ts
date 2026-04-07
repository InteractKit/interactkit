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
    AlphaCache: {
      get: async (entity, input) => {
        const s = entity.state.store as Record<string, string>;
        if (s[input.key]) { entity.state.hits++; return { hit: true, value: s[input.key] }; }
        entity.state.misses++;
        return { hit: false, value: null };
      },
      put: async (entity, input) => {
        const s = entity.state.store as Record<string, string>;
        s[input.key] = input.value;
      },
      stats: async (entity) => {
        return { hits: entity.state.hits, misses: entity.state.misses };
      },
    },
    AlphaWorker: {
      process: async (entity, input) => {
        entity.state.processed++;
        const cached = await entity.refs.alphaCache.get({ key: input.data });
        if (cached.hit) return { result: cached.value!, source: 'cache' };
        const result = input.data.toUpperCase() + '-ALPHA';
        await entity.refs.alphaCache.put({ key: input.data, value: result });
        return { result, source: 'compute' };
      },
    },
    BetaCache: {
      get: async (entity, input) => {
        const s = entity.state.store as Record<string, string>;
        return { hit: !!s[input.key], value: s[input.key] ?? null };
      },
      put: async (entity, input) => {
        const s = entity.state.store as Record<string, string>;
        s[input.key] = input.value;
      },
    },
    BetaWorker: {
      process: async (entity, input) => {
        entity.state.processed++;
        const cached = await entity.refs.betaCache.get({ key: input.data });
        if (cached.hit) return { result: cached.value!, source: 'cache' };
        const result = input.data.split('').reverse().join('') + '-BETA';
        await entity.refs.betaCache.put({ key: input.data, value: result });
        return { result, source: 'compute' };
      },
    },
    TeamAlpha: {
      process: async (entity, input) => {
        return entity.components.alphaWorker.process(input);
      },
      cacheStats: async (entity) => {
        return entity.components.alphaCache.stats();
      },
    },
    TeamBeta: {
      process: async (entity, input) => {
        return entity.components.betaWorker.process(input);
      },
    },
    Orchestrator: {
      submit: async (entity, input) => {
        await entity.components.taskQueue.enqueue({ id: input.id, data: input.data });
        await entity.components.resultStore.store({ taskId: input.id, result: input.result, worker: input.worker });
        await entity.components.taskQueue.complete({ id: input.id, result: input.result });
        return { stored: true };
      },
      queueStats: async (entity) => {
        return entity.components.taskQueue.stats();
      },
      getResults: async (entity) => {
        return entity.components.resultStore.getResults();
      },
      resultCount: async (entity) => {
        return entity.components.resultStore.count();
      },
    },
    TaskQueue: {
      enqueue: async (entity, input) => {
        const tasks = entity.state.tasks as Array<{ id: string; data: string; status: string }>;
        tasks.push({ id: input.id, data: input.data, status: 'pending' });
        await entity.components.logger.log({ msg: `enqueued: ${input.id}` });
        return { queued: tasks.length };
      },
      dequeue: async (entity) => {
        const tasks = entity.state.tasks as Array<{ id: string; data: string; status: string }>;
        const task = tasks.find(t => t.status === 'pending');
        if (!task) return null;
        task.status = 'processing';
        await entity.components.logger.log({ msg: `dequeued: ${task.id}` });
        return { id: task.id, data: task.data };
      },
      complete: async (entity, input) => {
        const tasks = entity.state.tasks as Array<{ id: string; data: string; status: string }>;
        const task = tasks.find(t => t.id === input.id);
        if (task) {
          task.status = 'done';
          await entity.components.logger.log({ msg: `completed: ${input.id}` });
        }
        return { completed: !!task };
      },
      stats: async (entity) => {
        const tasks = entity.state.tasks as Array<{ id: string; data: string; status: string }>;
        return {
          total: tasks.length,
          pending: tasks.filter(t => t.status === 'pending').length,
          processing: tasks.filter(t => t.status === 'processing').length,
          done: tasks.filter(t => t.status === 'done').length,
        };
      },
    },
    ResultStore: {
      store: async (entity, input) => {
        const results = entity.state.results as Array<{ taskId: string; result: string; worker: string }>;
        results.push(input);
        return results.length;
      },
      getResults: async (entity) => {
        return [...(entity.state.results as any[])];
      },
      count: async (entity) => {
        return (entity.state.results as any[]).length;
      },
    },
    Logger: {
      log: async (entity, input) => {
        const entries = entity.state.entries as string[];
        entries.push(`[${new Date().toISOString().slice(11, 19)}] ${input.msg}`);
        return entries.length;
      },
      getLogs: async (entity) => {
        return [...(entity.state.entries as string[])];
      },
      count: async (entity) => {
        return (entity.state.entries as string[]).length;
      },
    },
  },
});

await app.boot();

console.log('[26] === Mega Integration: 10 entities, 5 distributed ===');

// Phase 1: Process tasks through Alpha team
console.log('[26] --- Phase 1: Alpha processing ---');
for (let i = 0; i < 15; i++) {
  const r = await app.teamAlpha.process({ data: `job-${i}` });
  await app.orchestrator.submit({
    id: `alpha-${i}`, data: `job-${i}`, result: r.result, worker: 'alpha',
  });
}
const alphaStats = await app.teamAlpha.cacheStats();
console.log(`[26] alpha cache: hits=${alphaStats.hits}, misses=${alphaStats.misses}`);

// Phase 2: Process tasks through Beta team
console.log('[26] --- Phase 2: Beta processing ---');
for (let i = 0; i < 15; i++) {
  const r = await app.teamBeta.process({ data: `job-${i}` });
  await app.orchestrator.submit({
    id: `beta-${i}`, data: `job-${i}`, result: r.result, worker: 'beta',
  });
}

// Phase 3: Parallel — both teams process simultaneously
console.log('[26] --- Phase 3: Parallel both teams ---');
const parallel = await Promise.all([
  ...Array.from({ length: 20 }, (_, i) => app.teamAlpha.process({ data: `par-${i}` })),
  ...Array.from({ length: 20 }, (_, i) => app.teamBeta.process({ data: `par-${i}` })),
]);
console.log(`[26] parallel: ${parallel.length} results`);

// Submit parallel results to orchestrator
await Promise.all(parallel.map((r: any, i: number) =>
  app.orchestrator.submit({
    id: `par-${i}`, data: `par-${i % 20}`, result: r.result, worker: r.source,
  })
));

// Phase 4: Verify data integrity
console.log('[26] --- Phase 4: Verify ---');
const queueStats = await app.orchestrator.queueStats();
console.log(`[26] queue: total=${queueStats.total}, done=${queueStats.done}`);

const resultCount = await app.orchestrator.resultCount();
console.log(`[26] results stored: ${resultCount}`);

const results = await app.orchestrator.getResults();
const alphaResults = results.filter((r: any) => r.worker === 'alpha');
const betaResults = results.filter((r: any) => r.worker === 'beta');
console.log(`[26] alpha results: ${alphaResults.length}, beta results: ${betaResults.length}`);

// Verify alpha results are uppercase
const alphaCorrect = alphaResults.every((r: any) => r.result.includes('-ALPHA'));
console.log(`[26] alpha format correct: ${alphaCorrect}`);

// Verify beta results are reversed
const betaCorrect = betaResults.every((r: any) => r.result.includes('-BETA'));
console.log(`[26] beta format correct: ${betaCorrect}`);

// Phase 5: Cache hit verification — process same data again
console.log('[26] --- Phase 5: Cache hits ---');
const cached = await app.teamAlpha.process({ data: 'job-0' });
console.log(`[26] repeat job-0: source=${cached.source}`);
const finalCacheStats = await app.teamAlpha.cacheStats();
console.log(`[26] final cache: hits=${finalCacheStats.hits}, misses=${finalCacheStats.misses}`);

// Phase 6: Error path — process empty string (should still work)
console.log('[26] --- Phase 6: Edge cases ---');
const empty = await app.teamAlpha.process({ data: '' });
console.log(`[26] empty data: result="${empty.result}"`);

const total = resultCount;
console.log(`[26] === Total: ${total} results across 10 entities ===`);
console.log('[26] DONE');
await app.stop();
