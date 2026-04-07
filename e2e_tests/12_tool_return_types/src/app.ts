import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const app = graph.configure({ database: db, handlers: {
  Tools: {
    retString: async () => 'hello',
    retNumber: async () => 42,
    retBoolean: async () => true,
    retNull: async () => null,
    retUndefined: async () => undefined,
    retObject: async () => ({ a: 1, b: { c: 2 } }),
    retArray: async () => [1, 'two', { three: 3 }],
    retEmpty: async () => ({}),
    retLarge: async () => ({ items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` })) }),
  },
}});
await app.boot();

const s = await app.tools.retString(); console.log(`[12] string: "${s}" type=${typeof s}`);
const n = await app.tools.retNumber(); console.log(`[12] number: ${n} type=${typeof n}`);
const b = await app.tools.retBoolean(); console.log(`[12] boolean: ${b} type=${typeof b}`);
const nul = await app.tools.retNull(); console.log(`[12] null: ${nul} isNull=${nul === null}`);
const und = await app.tools.retUndefined(); console.log(`[12] undefined: ${und} isUndef=${und === undefined || und === null}`);
const obj = await app.tools.retObject(); console.log(`[12] object: ${JSON.stringify(obj)}`);
const arr = await app.tools.retArray(); console.log(`[12] array: ${JSON.stringify(arr)} isArr=${Array.isArray(arr)}`);
const empty = await app.tools.retEmpty(); console.log(`[12] empty: ${JSON.stringify(empty)}`);
const large = await app.tools.retLarge(); console.log(`[12] large: ${large.items.length} items, last=${large.items[99].name}`);

console.log('[12] DONE');
await app.stop();
