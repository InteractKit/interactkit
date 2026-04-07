import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const db = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, s: Record<string, unknown>) { store.set(id, s); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({
  database: db,
  handlers: {
    Worker: {
      process: async (entity, input) => {
        entity.state.processed++;
        (entity.state.log as string[]).push(input.data);
        return `DONE:${input.data.toUpperCase()}`;
      },
      getStats: async (entity) => ({
        processed: entity.state.processed,
        lastJob: (entity.state.log as string[]).at(-1) ?? '',
      }),
    },
  },
});

await app.boot();
await app.serve({ http: { port: 4100 } });
console.log('[worker] ready');
