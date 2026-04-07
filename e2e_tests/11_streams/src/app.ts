import { graph } from '../interactkit/.generated/graph.js';
const store = new Map<string, Record<string, unknown>>();
const db = { async get(id: string) { return store.get(id) ?? null; }, async set(id: string, s: Record<string, unknown>) { store.set(id, s); }, async delete(id: string) { store.delete(id); } };

const readings: number[] = [];
const logs: string[] = [];

const app = graph.configure({ database: db, handlers: {
  Sensor: {
    emitOne: async (entity, input) => {
      entity.streams.readings.emit(input.value);
      return { emitted: input.value };
    },
    emitBatch: async (entity, input) => {
      for (const v of input.values) entity.streams.readings.emit(v);
      return { count: input.values.length };
    },
  },
  Logger: {
    log: async (entity, input) => {
      entity.streams.entries.emit(input.msg);
      return { logged: true };
    },
  },
}});

// Subscribe to streams before boot
app.onStream('agent.sensor', 'readings', (value: number) => { readings.push(value); });
app.onStream('agent.logger', 'entries', (value: string) => { logs.push(value); });

await app.boot();

console.log('[11] === Single emissions ===');
await app.sensor.emitOne({ value: 10 });
await app.sensor.emitOne({ value: 20 });
await app.sensor.emitOne({ value: 30 });
console.log(`[11] readings after 3 emits: ${JSON.stringify(readings)}`);

console.log('[11] === Batch emissions ===');
await app.sensor.emitBatch({ values: [100, 200, 300, 400, 500] });
console.log(`[11] readings after batch: ${readings.length}`);

console.log('[11] === Multiple child streams ===');
await app.logger.log({ msg: 'hello' });
await app.logger.log({ msg: 'world' });
console.log(`[11] logs: ${JSON.stringify(logs)}`);

console.log('[11] === Rapid fire 50 emissions ===');
const before = readings.length;
for (let i = 0; i < 50; i++) await app.sensor.emitOne({ value: i });
console.log(`[11] rapid fire: ${readings.length - before} received`);

console.log('[11] === Parallel emissions ===');
const parBefore = readings.length;
await Promise.all(Array.from({ length: 20 }, (_, i) => app.sensor.emitOne({ value: 1000 + i })));
console.log(`[11] parallel: ${readings.length - parBefore} received`);

console.log(`[11] total readings: ${readings.length}`);
console.log(`[11] total logs: ${logs.length}`);

console.log('[11] DONE');
await app.stop();
