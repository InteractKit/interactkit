import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Store: {
    write: async (e, input) => {
      (e.state.entries as Record<string, string>)[input.key] = input.value;
      return true;
    },
    read: async (e, input) => {
      return (e.state.entries as Record<string, string>)[input.key] ?? null;
    },
  },
}});
await app.boot();

for (let i = 0; i < 10; i++) {
  await app.store.write({ key: `k${i}`, value: `v${i}` });
}
console.log('written: 10');

let readCount = 0;
for (let i = 0; i < 10; i++) {
  const val = await app.store.read({ key: `k${i}` });
  if (val === `v${i}`) readCount++;
}
console.log(`read back: ${readCount}`);
console.log('DONE');
await app.stop();
