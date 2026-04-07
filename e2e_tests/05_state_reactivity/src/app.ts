import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Agent: {
    setCount: async (e, input) => { e.state.count = input.value; return e.state.count; },
    setName: async (e, input) => { e.state.name = input.value; return e.state.name; },
    setData: async (e, input) => { e.state.data = { x: input.x, y: input.y }; return e.state.data; },
    getState: async (e) => ({ count: e.state.count, name: e.state.name }),
  },
}});
await app.boot();

console.log('[05] === Direct assignment ===');
await app.agent.setCount({ value: 42 });
const s1 = await app.agent.getState();
console.log(`[05] count after assign: ${s1.count}`);

await app.agent.setName({ value: 'changed' });
const s2 = await app.agent.getState();
console.log(`[05] name after assign: ${s2.name}`);

console.log('[05] === Object replacement ===');
const data = await app.agent.setData({ x: 10, y: 20 });
console.log(`[05] data: ${JSON.stringify(data)}`);

console.log('[05] === Multiple rapid mutations ===');
for (let i = 0; i < 100; i++) await app.agent.setCount({ value: i });
const s3 = await app.agent.getState();
console.log(`[05] count after 100 mutations: ${s3.count}`);

console.log('[05] === Describe reflects state ===');
const desc = await app.call('agent', 'describe');
console.log(`[05] describe: ${desc}`);

console.log('[05] === Tool mutates state ===');
await app.agent.setCount({ value: 999 });
const s4 = await app.agent.getState();
console.log(`[05] count after tool: ${s4.count}`);

await app.agent.setName({ value: 'tool-set' });
const s5 = await app.agent.getState();
console.log(`[05] name after tool: ${s5.name}`);

console.log('[05] DONE');
await app.stop();
