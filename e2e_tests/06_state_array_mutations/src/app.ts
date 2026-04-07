import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Agent: {
    testArrayMutations: async (entity) => {
      const items = entity.state.items;
      const nums = entity.state.nums;

      console.log('[06] === push ===');
      items.push('a', 'b', 'c');
      console.log(`[06] after push 3: ${items.length}`);

      for (let i = 0; i < 50; i++) items.push(`item-${i}`);
      console.log(`[06] after push 50 more: ${items.length}`);

      console.log('[06] === pop ===');
      const popped = items.pop();
      console.log(`[06] popped: ${popped}, length: ${items.length}`);

      console.log('[06] === unshift/shift ===');
      items.unshift('first');
      console.log(`[06] after unshift: [0]=${items[0]}, length=${items.length}`);
      const shifted = items.shift();
      console.log(`[06] shifted: ${shifted}, length: ${items.length}`);

      console.log('[06] === splice ===');
      items.splice(0, 5);
      console.log(`[06] after splice(0,5): length=${items.length}`);

      console.log('[06] === sort/reverse ===');
      entity.state.nums = [5, 3, 8, 1, 9, 2];
      entity.state.nums.sort((a: number, b: number) => a - b);
      console.log(`[06] sorted: ${JSON.stringify(entity.state.nums)}`);
      entity.state.nums.reverse();
      console.log(`[06] reversed: ${JSON.stringify(entity.state.nums)}`);

      console.log('[06] === fill ===');
      entity.state.nums.fill(0);
      console.log(`[06] filled: ${JSON.stringify(entity.state.nums)}`);

      console.log('[06] === index assignment ===');
      entity.state.nums[2] = 42;
      console.log(`[06] nums[2]: ${entity.state.nums[2]}`);

      console.log('[06] === reassign ===');
      entity.state.items = ['fresh', 'start'];
      console.log(`[06] after reassign: ${JSON.stringify(entity.state.items)}`);

      return 'done';
    },
  },
}});
await app.boot();
await app.agent.testArrayMutations();
console.log('[06] DONE');
await app.stop();
