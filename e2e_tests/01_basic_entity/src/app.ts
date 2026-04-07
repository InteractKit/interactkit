import { graph } from '../interactkit/.generated/graph.js';
import { InProcessBusAdapter } from '@interactkit/sdk';

// In-memory DB adapter for testing
const store = new Map<string, Record<string, unknown>>();
const memoryDb = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({
  database: memoryDb,
  handlers: {
    Agent: {
      increment: async (entity, input) => {
        entity.state.count += input.amount;
        return { count: entity.state.count };
      },
      getCount: async (entity) => entity.state.count,
      addLog: async (entity, input) => {
        entity.state.log.push(input.entry);
        return { total: entity.state.log.length };
      },
      getLogs: async (entity) => [...entity.state.log],
      returnObject: async () => ({ nested: { deep: true }, arr: [1, 2, 3] }),
      returnArray: async () => [{ a: 1 }, { b: 2 }],
      returnString: async () => 'hello world',
      returnNumber: async () => 42,
      returnNull: async () => null,
    },
  },
});

await app.boot();

// === Sequential tool calls ===
console.log('[01] === Sequential tool calls ===');

for (let i = 1; i <= 50; i++) {
  const r = await app.agent.increment({ amount: 1 });
  if (r.count !== i) {
    console.error(`[01] FAIL: expected count ${i}, got ${r.count}`);
    process.exit(1);
  }
}
const c1 = await app.agent.getCount();
console.log(`[01] 50 sequential increments: count=${c1}`);

await app.agent.increment({ amount: 10 });
await app.agent.increment({ amount: 25 });
await app.agent.increment({ amount: -5 });
const c2 = await app.agent.getCount();
console.log(`[01] after +10,+25,-5: count=${c2}`);

// === Parallel tool calls ===
console.log('[01] === Parallel tool calls ===');
await Promise.all(Array.from({ length: 20 }, () => app.agent.increment({ amount: 1 })));
const c3 = await app.agent.getCount();
console.log(`[01] 20 parallel increments: count=${c3}`);

// === Logging tool ===
console.log('[01] === Logging tool ===');
await app.agent.addLog({ entry: 'first' });
await app.agent.addLog({ entry: 'second' });
await app.agent.addLog({ entry: 'third' });
const logs = await app.agent.getLogs();
console.log(`[01] ${JSON.stringify(logs)}`);

// === Return types ===
console.log('[01] === Return types ===');
const obj = await app.agent.returnObject();
console.log(`[01] ${JSON.stringify(obj)}`);
const arr = await app.agent.returnArray();
console.log(`[01] ${JSON.stringify(arr)}`);
const str = await app.agent.returnString();
console.log(`[01] string: ${str}`);
const num = await app.agent.returnNumber();
console.log(`[01] number: ${num}`);
const nul = await app.agent.returnNull();
console.log(`[01] null: ${nul}`);

// === Describe ===
console.log('[01] === Describe reflects state ===');
const desc = await app.call('agent', 'describe');
console.log(`[01] ${desc}`);

console.log('[01] DONE');
await app.stop();
