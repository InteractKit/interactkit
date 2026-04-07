import { graph } from '../interactkit/.generated/graph.js';

// In-memory DB adapter for testing
const store = new Map<string, Record<string, unknown>>();
const memoryDb = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

// Simulate counter and nested state inside worker handlers
let counterValue = 0;
const nestedItems: string[] = [];
let nestedCounterValue = 0;

const app = graph.configure({
  database: memoryDb,
  handlers: {
    Agent: {
      runAll: async (entity) => {
        const results: string[] = [];

        // === 1. Serializable ===
        console.log('[29] === Serializable ===');
        await entity.components.worker.store({ text: 'hello' });
        await entity.components.worker.store({ text: 'world' });
        const after = await entity.components.worker.getData();
        console.log(`[29] after store: count=${after.count}, items=${JSON.stringify(after.items)}`);
        results.push(after.count === 2 ? 'store:PASS' : 'store:FAIL');

        // === 2. Function proxy (adapted: call add tool directly) ===
        console.log('[29] === Function proxy ===');
        const sum = await entity.components.worker.add({ a: 3, b: 4 });
        console.log(`[29] function proxy: ${sum === 7 ? 'PASS' : 'FAIL'}`);
        results.push(sum === 7 ? 'function:PASS' : 'function:FAIL');

        // === 3. Class instance proxy (adapted: counter ops tool) ===
        console.log('[29] === Class instance proxy ===');
        const v1 = await entity.components.worker.counterOps({ op: 'increment' });
        const v2 = await entity.components.worker.counterOps({ op: 'increment' });
        const v3 = await entity.components.worker.counterOps({ op: 'get' });
        console.log(`[29] class proxy: ${v1 === 1 && v2 === 2 && v3 === 2 ? 'PASS' : 'FAIL'}`);
        results.push(v1 === 1 && v2 === 2 && v3 === 2 ? 'class:PASS' : 'class:FAIL');

        // === 4. Recursive proxy (adapted: nested ops tool) ===
        console.log('[29] === Recursive proxy ===');
        const n1 = await entity.components.worker.nestedOps({ op: 'add', item: 'one' });
        const n2 = await entity.components.worker.nestedOps({ op: 'add', item: 'two' });
        const n3 = await entity.components.worker.nestedOps({ op: 'counterIncrement', item: '' });
        const n4 = await entity.components.worker.nestedOps({ op: 'counterIncrement', item: '' });
        const n5 = await entity.components.worker.nestedOps({ op: 'counterGet', item: '' });
        console.log(`[29] recursive proxy: ${n1.value === 1 && n2.value === 2 && n5.value === 2 ? 'PASS' : 'FAIL'}`);
        results.push(n1.value === 1 && n2.value === 2 && n5.value === 2 ? 'recursive:PASS' : 'recursive:FAIL');

        // === 5. Curried function (adapted: curried tool) ===
        console.log('[29] === Curried function ===');
        const curried = await entity.components.worker.curried({ prefix: 'hello', suffix: 'world' });
        console.log(`[29] curried proxy: ${curried === 'hello:world' ? 'PASS' : 'FAIL'}`);
        results.push(curried === 'hello:world' ? 'curried:PASS' : 'curried:FAIL');

        // === 6. Promise.all ===
        console.log('[29] === Promise.all ===');
        const [d1, d2, d3] = await Promise.all([
          entity.components.worker.getPid(),
          entity.components.worker.getPid(),
          entity.components.worker.getPid(),
        ]);
        console.log(`[29] promise.all: ${d1 === d2 && d2 === d3 ? 'PASS' : 'FAIL'}`);
        results.push(d1 === d2 && d2 === d3 ? 'promiseAll:PASS' : 'promiseAll:FAIL');

        console.log('[29] DONE');
        return { results };
      },
    },
    Worker: {
      store: async (entity, input) => {
        entity.state.data.push(input.text);
        return { stored: true, total: entity.state.data.length };
      },
      getData: async (entity) => {
        return { items: [...entity.state.data], count: entity.state.data.length };
      },
      add: async (_entity, input) => {
        return input.a + input.b;
      },
      counterOps: async (_entity, input) => {
        if (input.op === 'increment') return ++counterValue;
        return counterValue;
      },
      nestedOps: async (_entity, input) => {
        if (input.op === 'add') {
          nestedItems.push(input.item);
          return { value: nestedItems.length, items: [...nestedItems] };
        }
        if (input.op === 'counterIncrement') {
          return { value: ++nestedCounterValue, items: [...nestedItems] };
        }
        // counterGet
        return { value: nestedCounterValue, items: [...nestedItems] };
      },
      curried: async (_entity, input) => {
        return `${input.prefix}:${input.suffix}`;
      },
      getPid: async () => {
        return process.pid;
      },
    },
  },
});

await app.boot();
await app.agent.runAll();
await app.stop();
