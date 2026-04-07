import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Memory: {
    store: async (e, input) => { e.state.entries.push(input.text); return e.state.entries.length; },
    getAll: async (e) => [...e.state.entries],
    count: async (e) => e.state.entries.length,
    search: async (e, input) => e.state.entries.filter((x: string) => x.includes(input.query)),
  },
}});
await app.boot();

console.log('[13] === Basic distributed calls ===');

// Store 20 entries
for (let i = 0; i < 20; i++) {
  await app.memory.store({ text: `item-${i}` });
}
const count = await app.memory.count();
console.log(`[13] stored 20, count: ${count}`);

// Search
const found = await app.memory.search({ query: 'item-1' });
console.log(`[13] search "item-1": ${found.length} results`);

// Get all
const all = await app.memory.getAll();
console.log(`[13] getAll: ${all.length} entries`);

// Parallel stores
console.log('[13] === Parallel distributed ===');
await Promise.all(
  Array.from({ length: 30 }, (_, i) => app.memory.store({ text: `par-${i}` }))
);
const finalCount = await app.memory.count();
console.log(`[13] after 30 parallel: ${finalCount}`);

// Verify data integrity
const finalAll = await app.memory.getAll();
const hasFirst = finalAll.includes('item-0');
const hasLast = finalAll.includes('par-29');
console.log(`[13] integrity: first=${hasFirst}, last=${hasLast}`);

console.log('[13] DONE');
await app.stop();
