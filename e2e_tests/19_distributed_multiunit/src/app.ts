import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Alpha: {
    process: async (_e, input) => `alpha:${input.data}`,
  },
  Beta: {
    process: async (_e, input) => `beta:${input.data}`,
  },
  Gamma: {
    process: async (_e, input) => `gamma:${input.data}`,
  },
}});
await app.boot();

const [a, b, g] = await Promise.all([
  app.alpha.process({ data: 'test' }),
  app.beta.process({ data: 'test' }),
  app.gamma.process({ data: 'test' }),
]);
console.log(a);
console.log(b);
console.log(g);
if (a && b && g) console.log('all 3 responded');
console.log('DONE');
await app.stop();
