import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Db: {
    set: async (e, input) => {
      const records = e.state.records as Array<{ key: string; val: string }>;
      e.state.records = records.filter((r: { key: string }) => r.key !== input.key);
      (e.state.records as Array<{ key: string; val: string }>).push({ key: input.key, val: input.val });
      return (e.state.records as Array<unknown>).length;
    },
    get: async (e, input) => {
      const records = e.state.records as Array<{ key: string; val: string }>;
      return records.find((r: { key: string }) => r.key === input.key)?.val ?? null;
    },
    keys: async (e) => {
      const records = e.state.records as Array<{ key: string; val: string }>;
      return records.map((r: { key: string }) => r.key);
    },
  },
  Cache: {
    put: async (e, input) => { (e.state.store as Record<string, string>)[input.key] = input.val; return true; },
    fetch: async (e, input) => { return (e.state.store as Record<string, string>)[input.key] ?? null; },
    size: async (e) => { return Object.keys(e.state.store as Record<string, string>).length; },
  },
}});
await app.boot();

console.log('[17] === 3 units: world + db + cache ===');

// Write to both
for (let i = 0; i < 15; i++) {
  await app.db.set({ key: `k${i}`, val: `v${i}` });
  await app.cache.put({ key: `k${i}`, val: `v${i}` });
}

const dbKeys = await app.db.keys();
const cacheSize = await app.cache.size();
console.log(`[17] db keys: ${dbKeys.length}, cache size: ${cacheSize}`);

// Read back from both
const dbVal = await app.db.get({ key: 'k7' });
const cacheVal = await app.cache.fetch({ key: 'k7' });
console.log(`[17] db k7: ${dbVal}, cache k7: ${cacheVal}`);
console.log(`[17] match: ${dbVal === cacheVal}`);

// Parallel writes to both services
console.log('[17] === Parallel to db + cache ===');
await Promise.all([
  ...Array.from({ length: 20 }, (_, i) => app.db.set({ key: `p${i}`, val: `pv${i}` })),
  ...Array.from({ length: 20 }, (_, i) => app.cache.put({ key: `p${i}`, val: `pv${i}` })),
]);
const finalDb = (await app.db.keys()).length;
const finalCache = await app.cache.size();
console.log(`[17] final: db=${finalDb}, cache=${finalCache}`);

console.log('[17] DONE');
await app.stop();
