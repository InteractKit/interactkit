import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Counter: {
    increment: async (e, input) => {
      e.state.value += input.by;
      e.state.history.push(e.state.value);
      return e.state.value;
    },
    get: async (e) => ({ value: e.state.value, historyLen: e.state.history.length }),
    getHistory: async (e) => [...e.state.history],
  },
}});
await app.boot();

console.log('[15] === Sequential increments with Prisma ===');
for (let i = 1; i <= 10; i++) await app.counter.increment({ by: i });
const state = await app.counter.get();
console.log(`[15] value: ${state.value}, history: ${state.historyLen}`);
console.log(`[15] correct: ${state.value === 55}`);

console.log('[15] === Parallel increments ===');
await Promise.all(Array.from({ length: 20 }, () => app.counter.increment({ by: 1 })));
const after = await app.counter.get();
console.log(`[15] after parallel: ${after.value}`);

console.log('[15] DONE');
await app.stop();
