import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Worker: {
    echo: async (_e, input) => `${input.msg}:echoed`,
  },
}});
await app.boot();

const result = await app.worker.echo({ msg: 'hello' });
console.log(`echo: ${result}`);
console.log('DONE');
await app.stop();
