import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Memory: {
    store: async (e, input) => { e.state.entries.push(input.text); return e.state.entries.length; },
    count: async (e) => e.state.entries.length,
    getAll: async (e) => [...e.state.entries],
  },
}});
await app.boot();

console.log('[10] === 50 parallel stores ===');
await Promise.all(Array.from({ length: 50 }, (_, i) => app.memory.store({ text: `item-${i}` })));
console.log(`[10] count after 50 parallel: ${await app.memory.count()}`);

console.log('[10] === 100 parallel stores ===');
await Promise.all(Array.from({ length: 100 }, (_, i) => app.memory.store({ text: `batch-${i}` })));
console.log(`[10] count after 100 more parallel: ${await app.memory.count()}`);

console.log('[10] === Mixed parallel read/write ===');
await Promise.all([
  app.memory.store({ text: 'rw-0' }), app.memory.count(),
  app.memory.store({ text: 'rw-1' }), app.memory.count(),
  app.memory.store({ text: 'rw-2' }), app.memory.getAll(),
]);
console.log(`[10] final count: ${await app.memory.count()}`);

const all = await app.memory.getAll();
console.log(`[10] has item-0: ${all.includes('item-0')}, batch-99: ${all.includes('batch-99')}, rw-2: ${all.includes('rw-2')}`);

console.log('[10] DONE');
await app.stop();
