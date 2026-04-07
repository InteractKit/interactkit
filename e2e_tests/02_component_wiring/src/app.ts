import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Memory: {
    store: async (e, input) => { e.state.entries.push(input.text); return { total: e.state.entries.length }; },
    getAll: async (e) => [...e.state.entries],
    search: async (e, input) => e.state.entries.filter((x: string) => x.includes(input.query)),
    count: async (e) => e.state.entries.length,
    clear: async (e) => { e.state.entries = []; return { cleared: true }; },
  },
  Counter: {
    increment: async (e, input) => { e.state.value += input.by; return { value: e.state.value }; },
    get: async (e) => e.state.value,
  },
}});
await app.boot();

console.log('[02] === Component basic calls ===');
for (let i = 0; i < 30; i++) await app.memory.store({ text: `entry-${i}` });
console.log(`[02] stored 30, count=${await app.memory.count()}`);

const found = await app.memory.search({ query: 'entry-1' });
console.log(`[02] search "entry-1": ${found.length} results`);

const all = await app.memory.getAll();
console.log(`[02] getAll length: ${all.length}`);

console.log('[02] === Multiple components ===');
await app.counter.increment({ by: 10 });
await app.counter.increment({ by: 5 });
await app.counter.increment({ by: -3 });
console.log(`[02] counter: ${await app.counter.get()}`);

console.log('[02] === Parallel cross-component ===');
await Promise.all([
  app.memory.store({ text: 'parallel-1' }), app.memory.store({ text: 'parallel-2' }),
  app.counter.increment({ by: 1 }), app.counter.increment({ by: 1 }),
  app.memory.store({ text: 'parallel-3' }), app.counter.increment({ by: 1 }),
]);
console.log(`[02] after parallel: memory=${await app.memory.count()}, counter=${await app.counter.get()}`);

console.log('[02] === Clear and reuse ===');
await app.memory.clear();
console.log(`[02] after clear: ${await app.memory.count()}`);
await app.memory.store({ text: 'fresh' });
console.log(`[02] after re-store: ${JSON.stringify(await app.memory.getAll())}`);

console.log('[02] DONE');
await app.stop();
