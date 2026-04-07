import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const memoryDb = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

const received: number[] = [];

const app = graph.configure({
  database: memoryDb,
  handlers: {
    Sensor: {
      read: async (entity, input) => {
        entity.state.emitted++;
        entity.streams.readings.emit({ value: input.value, ts: Date.now() });
        return { emitted: entity.state.emitted };
      },
      batchRead: async (entity, input) => {
        for (const v of input.values) {
          entity.state.emitted++;
          entity.streams.readings.emit({ value: v, ts: Date.now() });
        }
        return { emitted: entity.state.emitted };
      },
    },
  },
});

// Subscribe to stream
app.onStream('agent.sensor', 'readings', (payload: any) => {
  received.push(payload.value);
});

await app.boot();

console.log('[28] === Sequential reads ===');
for (let i = 0; i < 10; i++) {
  await app.sensor.read({ value: i * 10 });
}
console.log(`[28] received: ${received.length}`);
console.log(`[28] values: ${JSON.stringify(received)}`);

console.log('[28] === Batch read ===');
const before = received.length;
await app.sensor.batchRead({ values: [100, 200, 300, 400, 500] });
const batchReceived = received.length - before;
console.log(`[28] batch received: ${batchReceived}`);

console.log('[28] === Parallel reads ===');
const parBefore = received.length;
await Promise.all(
  Array.from({ length: 20 }, (_, i) => app.sensor.read({ value: 1000 + i }))
);
const parReceived = received.length - parBefore;
console.log(`[28] parallel received: ${parReceived}`);

console.log(`[28] total: ${received.length} values`);

// Verify data integrity
const hasFirst = received.includes(0);
const hasBatch = received.includes(300);
const hasParallel = received.includes(1019);
console.log(`[28] integrity: first=${hasFirst}, batch=${hasBatch}, parallel=${hasParallel}`);

console.log('[28] DONE');
await app.stop();
