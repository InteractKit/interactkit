import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const memoryDb = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({
  database: memoryDb,
  handlers: {
    Memory: {
      store: async (entity, input) => {
        entity.state.entries.push(input.text);
        return entity.state.entries.length;
      },
    },
  },
});

await app.boot();

// Quick smoke test: call a tool to prove the generated code works
const count = await app.memory.store({ text: 'test' });
if (typeof count === 'number' && count === 1) {
  console.log('CODEGEN_OK');
} else {
  console.error(`FAIL: expected 1, got ${count}`);
  process.exit(1);
}

await app.stop();
