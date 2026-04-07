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
    StepB: {
      processB: async (entity, input) => {
        const result = await entity.components.stepC.processC({ data: `B(${input.data})` });
        return { ...result, step: 'B→C→D' };
      },
    },
    StepC: {
      processC: async (entity, input) => {
        const result = await entity.components.stepD.finalize({ data: `C(${input.data})` });
        return { ...result, step: 'C→D' };
      },
    },
    StepD: {
      finalize: async (entity, input) => {
        entity.state.count++;
        return { result: `FINAL:${input.data}`, step: 'D', n: entity.state.count };
      },
    },
  },
});

await app.boot();

console.log('[23] === Chain: World → B → C → D (all in-process) ===');

const r1 = await app.stepB.processB({ data: 'hello' });
console.log(`[23] result: ${JSON.stringify(r1)}`);

// Verify the data flowed through all 3 hops
const hasChain = r1.result.includes('C(B(hello))');
console.log(`[23] chain correct: ${hasChain}`);

console.log('[23] === 20 sequential through chain ===');
for (let i = 0; i < 20; i++) {
  await app.stepB.processB({ data: `seq-${i}` });
}
console.log('[23] 20 sequential done');

console.log('[23] === 10 parallel through chain ===');
const parallel = await Promise.all(
  Array.from({ length: 10 }, (_, i) => app.stepB.processB({ data: `par-${i}` }))
);
const allFinal = parallel.every(r => r.result.startsWith('FINAL:'));
console.log(`[23] parallel: ${parallel.length} results, all final: ${allFinal}`);

console.log('[23] DONE');
await app.stop();
