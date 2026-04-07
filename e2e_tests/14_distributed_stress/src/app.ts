import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Memory: {
    store: async (e, input) => { e.state.entries.push(input.text); return e.state.entries.length; },
    count: async (e) => e.state.entries.length,
    getAll: async (e) => [...e.state.entries],
  },
}});
await app.boot();

console.log('[14] === 200 sequential stores via Redis ===');
for (let i = 0; i < 200; i++) {
  await app.memory.store({ text: `seq-${i}` });
}
const seqCount = await app.memory.count();
console.log(`[14] sequential: ${seqCount}`);

console.log('[14] === 100 parallel stores via Redis ===');
await Promise.all(
  Array.from({ length: 100 }, (_, i) => app.memory.store({ text: `par-${i}` }))
);
const parCount = await app.memory.count();
console.log(`[14] after parallel: ${parCount}`);

console.log('[14] === Rapid fire 50 reads ===');
const reads = await Promise.all(
  Array.from({ length: 50 }, () => app.memory.count())
);
const allSame = reads.every(r => r === parCount);
console.log(`[14] 50 parallel reads consistent: ${allSame}`);

console.log('[14] === Verify data integrity ===');
const all = await app.memory.getAll();
const hasSeq0 = all.includes('seq-0');
const hasSeq199 = all.includes('seq-199');
const hasPar0 = all.includes('par-0');
const hasPar99 = all.includes('par-99');
console.log(`[14] seq-0:${hasSeq0} seq-199:${hasSeq199} par-0:${hasPar0} par-99:${hasPar99}`);

console.log('[14] DONE');
await app.stop();
