import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Memory: {
    store: async (e, input) => { e.state.entries.push(input.text); return { total: e.state.entries.length }; },
    getAll: async (e) => [...e.state.entries],
    count: async (e) => e.state.entries.length,
  },
  Brain: {
    think: async (entity, input) => {
      await entity.refs.memory.store({ text: `thought: ${input.thought}` });
      return { stored: true };
    },
    batchThink: async (entity, input) => {
      for (const t of input.thoughts) await entity.refs.memory.store({ text: `thought: ${t}` });
      const count = await entity.refs.memory.count();
      return { stored: input.thoughts.length, totalInMemory: count };
    },
    recallAll: async (entity) => entity.refs.memory.getAll(),
  },
}});
await app.boot();

console.log('[03] === Ref basic call ===');
await app.brain.think({ thought: 'hello' });
await app.brain.think({ thought: 'world' });
console.log(`[03] after 2 thinks, memory count: ${await app.memory.count()}`);

console.log('[03] === Ref batch + verify ===');
const thoughts = Array.from({ length: 20 }, (_, i) => `idea-${i}`);
const br = await app.brain.batchThink({ thoughts });
console.log(`[03] batch stored: ${br.stored}, total: ${br.totalInMemory}`);

const all = await app.brain.recallAll();
console.log(`[03] recall count: ${all.length}`);
const parentAll = await app.memory.getAll();
console.log(`[03] parent sees: ${parentAll.length}`);
console.log(`[03] match: ${all.length === parentAll.length}`);

console.log('[03] === Ref parallel stress ===');
await Promise.all(Array.from({ length: 15 }, (_, i) => app.brain.think({ thought: `parallel-${i}` })));
console.log(`[03] after 15 parallel thinks: ${await app.memory.count()}`);
const finalAll = await app.memory.getAll();
console.log(`[03] has first: ${finalAll.includes('thought: hello')}, has last: ${finalAll.some((e: string) => e.includes('parallel-14'))}`);

console.log('[03] DONE');
await app.stop();
