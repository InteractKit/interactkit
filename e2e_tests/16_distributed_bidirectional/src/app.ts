import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  ServiceA: {
    processA: async (e, input) => {
      e.state.calls++;
      return { from: 'A', data: input.data.toUpperCase(), callNum: e.state.calls };
    },
    statsA: async (e) => ({ calls: e.state.calls }),
  },
  ServiceB: {
    processB: async (e, input) => {
      e.state.calls++;
      return { from: 'B', data: input.data.split('').reverse().join(''), callNum: e.state.calls };
    },
    statsB: async (e) => ({ calls: e.state.calls }),
  },
}});
await app.boot();

console.log('[16] === Call both services ===');

const a1 = await app.svcA.processA({ data: 'hello' });
console.log(`[16] A: ${JSON.stringify(a1)}`);

const b1 = await app.svcB.processB({ data: 'hello' });
console.log(`[16] B: ${JSON.stringify(b1)}`);

console.log('[16] === Interleaved calls ===');
for (let i = 0; i < 10; i++) {
  await app.svcA.processA({ data: `msg-${i}` });
  await app.svcB.processB({ data: `msg-${i}` });
}

const statsA = await app.svcA.statsA();
const statsB = await app.svcB.statsB();
console.log(`[16] A calls: ${statsA.calls}, B calls: ${statsB.calls}`);

console.log('[16] === Parallel to both ===');
const results = await Promise.all([
  ...Array.from({ length: 15 }, (_, i) => app.svcA.processA({ data: `p-${i}` })),
  ...Array.from({ length: 15 }, (_, i) => app.svcB.processB({ data: `p-${i}` })),
]);
const aResults = results.filter(r => r.from === 'A').length;
const bResults = results.filter(r => r.from === 'B').length;
console.log(`[16] parallel: A=${aResults}, B=${bResults}`);

const finalA = await app.svcA.statsA();
const finalB = await app.svcB.statsB();
console.log(`[16] final: A=${finalA.calls}, B=${finalB.calls}`);

console.log('[16] DONE');
await app.stop();
