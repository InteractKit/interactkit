import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Calculator: {
    add: async (e) => { e.state.counter++; return e.state.counter; },
    get: async (e) => e.state.counter,
  },
}});
await app.boot();

await Promise.all(
  Array.from({ length: 500 }, () => app.calculator.add())
);
const count = await app.calculator.get();
console.log(`count: ${count}`);
console.log('DONE');
await app.stop();
