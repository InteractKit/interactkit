import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const initOrder: string[] = [];

const app = graph.configure({ database: db, handlers: {
  Counter: {
    increment: async (e, input) => { e.state.value += input.by; return e.state.value; },
    get: async (e) => e.state.value,
    init: async (e) => {
      initOrder.push('counter');
      console.log(`[08] counter init: entityId=${e.id}`);
      e.state.value = 100;
      console.log(`[08] counter set to 100 in init`);
    },
  },
  Agent: {
    init: async (e) => {
      initOrder.push('agent');
      e.state.initCalls++;
      console.log(`[08] agent init #${e.state.initCalls}: entityId=${e.id}, firstBoot=true`);

      // Child should have already init'd (bottom-up)
      const counterVal = await e.components.counter.get();
      console.log(`[08] counter value after child init: ${counterVal}`);

      await e.components.counter.increment({ by: 5 });
      const after = await e.components.counter.get();
      console.log(`[08] counter after increment: ${after}`);

      console.log(`[08] agent initCalls: ${e.state.initCalls}`);
    },
  },
}});
await app.boot();

// Verify bottom-up order
console.log(`[08] init order: ${JSON.stringify(initOrder)}`);
console.log('[08] DONE');
await app.stop();
