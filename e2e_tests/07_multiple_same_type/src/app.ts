import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Memory: {
    store: async (e, input) => { e.state.entries.push(input.text); return e.state.entries.length; },
    getAll: async (e) => [...e.state.entries],
    count: async (e) => e.state.entries.length,
  },
  TeamA: {
    storeA: async (e, input) => e.components.memory.store({ text: `A:${input.text}` }),
    getA: async (e) => e.components.memory.getAll(),
    countA: async (e) => e.components.memory.count(),
  },
  TeamB: {
    storeB: async (e, input) => e.components.memory.store({ text: `B:${input.text}` }),
    getB: async (e) => e.components.memory.getAll(),
    countB: async (e) => e.components.memory.count(),
  },
}});
await app.boot();

console.log('[07] === State isolation ===');
for (let i = 0; i < 10; i++) await app.teamA.storeA({ text: `item-${i}` });
for (let i = 0; i < 5; i++) await app.teamB.storeB({ text: `item-${i}` });
const countA = await app.teamA.countA();
const countB = await app.teamB.countB();
console.log(`[07] A count: ${countA}, B count: ${countB}`);

const entriesA = await app.teamA.getA();
const entriesB = await app.teamB.getB();
console.log(`[07] A has B entries: ${entriesA.some((e: string) => e.startsWith('B:'))}`);
console.log(`[07] B has A entries: ${entriesB.some((e: string) => e.startsWith('A:'))}`);

console.log('[07] === Parallel to both ===');
await Promise.all([
  ...Array.from({ length: 20 }, (_, i) => app.teamA.storeA({ text: `par-${i}` })),
  ...Array.from({ length: 20 }, (_, i) => app.teamB.storeB({ text: `par-${i}` })),
]);
console.log(`[07] final A: ${await app.teamA.countA()}, final B: ${await app.teamB.countB()}`);

console.log('[07] DONE');
await app.stop();
