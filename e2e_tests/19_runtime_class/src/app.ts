import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Memory: {
    store: async (e, input) => { e.state.entries.push(input.text); return e.state.entries.length; },
    getAll: async (e) => [...e.state.entries],
  },
  Brain: {
    think: async (entity, input) => {
      await entity.refs.memory.store({ text: input.thought });
      return { stored: true };
    },
  },
  Agent: {
    chat: async (entity, input) => {
      await entity.components.brain.think({ thought: input.msg });
      return entity.components.memory.getAll();
    },
  },
}});
await app.boot();

// Store via memory directly
await app.memory.store({ text: 'direct' });
const all = await app.memory.getAll();
console.log(`[19] direct call: ${JSON.stringify(all)}`);

// Store via brain (which uses ref to memory)
await app.brain.think({ thought: 'via-ref' });
const all2 = await app.memory.getAll();
console.log(`[19] ref call: ${JSON.stringify(all2)}`);

console.log('[19] shutdown clean');
await app.stop();
