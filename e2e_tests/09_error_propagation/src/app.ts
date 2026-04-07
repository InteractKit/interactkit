import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Broken: {
    fail: async (_e, input) => { throw new Error(`BOOM: ${input.msg}`); },
    failTyped: async (_e, input) => { throw new Error(`Error code ${input.code}`); },
  },
}});
await app.boot();

console.log('[09] === Error from tool ===');
try {
  await app.broken.fail({ msg: 'test-error' });
  console.error('[09] FAIL: should have thrown');
  process.exit(1);
} catch (e: any) {
  console.log(`[09] caught: ${e.message}`);
  console.log(`[09] has correct message: ${e.message.includes('BOOM: test-error')}`);
}

console.log('[09] === Multiple errors ===');
let errorCount = 0;
for (let i = 0; i < 5; i++) {
  try { await app.broken.fail({ msg: `err-${i}` }); } catch (e: any) {
    if (e.message.includes(`err-${i}`)) errorCount++;
  }
}
console.log(`[09] caught ${errorCount}/5 errors with correct messages`);

console.log('[09] === Error doesn\'t break subsequent calls ===');
try { await app.broken.fail({ msg: 'first' }); } catch {}
try {
  await app.broken.failTyped({ code: 404 });
} catch (e: any) {
  console.log(`[09] second error: ${e.message}`);
}

console.log('[09] === Parallel errors ===');
const results = await Promise.allSettled(
  Array.from({ length: 10 }, (_, i) => app.broken.fail({ msg: `par-${i}` }))
);
const rejections = results.filter(r => r.status === 'rejected');
console.log(`[09] parallel: ${rejections.length}/10 rejected`);

console.log('[09] DONE');
await app.stop();
