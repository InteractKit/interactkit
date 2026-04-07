import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const db = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, s: Record<string, unknown>) { store.set(id, s); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({ database: db });

await app.boot();

console.log('[33] === Remote HTTP proxy ===');

// Single call
const r1 = await app.worker.process({ data: 'hello' });
console.log(`[33] single: ${r1}`);

// Multiple sequential calls
for (let i = 0; i < 5; i++) {
  await app.worker.process({ data: `job-${i}` });
}
const stats = await app.worker.getStats();
console.log(`[33] sequential: processed=${stats.processed}, last=${stats.lastJob}`);

// Parallel calls
const results = await Promise.all(
  Array.from({ length: 10 }, (_, i) => app.worker.process({ data: `par-${i}` }))
);
console.log(`[33] parallel: ${results.length} results`);
console.log(`[33] all uppercase: ${results.every(r => r.startsWith('DONE:'))}`);

// Final stats
const finalStats = await app.worker.getStats();
console.log(`[33] final: processed=${finalStats.processed}`);

console.log('[33] DONE');
await app.stop();
process.exit(0);
