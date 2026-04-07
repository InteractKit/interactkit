import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const db = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({
  database: db,
  handlers: {
    Agent: {
      chat: async (entity, input) => {
        entity.state.messageCount++;
        await entity.components.memory.store({ text: input.message });
        return `[${entity.id}] echo: ${input.message} (#${entity.state.messageCount})`;
      },
      getCount: async (entity) => entity.state.messageCount,
    },
    Memory: {
      store: async (entity, input) => {
        (entity.state.entries as string[]).push(input.text);
        return (entity.state.entries as string[]).length;
      },
      getAll: async (entity) => [...(entity.state.entries as string[])],
    },
  },
});

await app.boot();

const srv = await app.serve({
  http: {
    port: 4200,
    tenantFrom: (req) => req.headers['x-tenant'] as string | undefined,
    maxTenants: 100,
    tenantIdleMs: 60_000,
  },
});

console.log('[34] server ready');

// Keep alive for test
await new Promise(() => {});
