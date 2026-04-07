import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Ping: {
    ping: async (_e, input) => `ping-${input.n}`,
  },
  Pong: {
    pong: async (_e, input) => `pong-${input.n}`,
  },
}});
await app.boot();

let exchanges = 0;
for (let i = 0; i < 5; i++) {
  const p = await app.ping.ping({ n: i });
  const q = await app.pong.pong({ n: i });
  if (p === `ping-${i}` && q === `pong-${i}`) exchanges++;
}
console.log(`exchanges: ${exchanges}`);
console.log('DONE');
await app.stop();
