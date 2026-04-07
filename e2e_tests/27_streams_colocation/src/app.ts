import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const memoryDb = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

const sensorData: number[] = [];
const alarmData: string[] = [];

const app = graph.configure({
  database: memoryDb,
  handlers: {
    Sensor: {
      read: async (entity, input) => {
        entity.state.emitted++;
        entity.streams.readings.emit({ value: input.value, ts: Date.now() });
        return { emitted: entity.state.emitted };
      },
    },
    Alarm: {
      trigger: async (entity, input) => {
        entity.state.triggered++;
        entity.streams.alerts.emit(`ALARM:${input.level}:${entity.state.triggered}`);
        return { triggered: entity.state.triggered };
      },
    },
    Store: {
      record: async (entity, input) => {
        const events = entity.state.events as string[];
        events.push(input.event);
        return events.length;
      },
      getEvents: async (entity) => {
        return [...(entity.state.events as string[])];
      },
      count: async (entity) => {
        return (entity.state.events as string[]).length;
      },
    },
  },
});

// Subscribe to streams before boot
app.onStream('world.sensor', 'readings', (payload: any) => {
  sensorData.push(payload.value);
  // Forward to store
  app.store.record({ event: `sensor:${payload.value}` });
});

app.onStream('world.alarm', 'alerts', (msg: string) => {
  alarmData.push(msg);
  app.store.record({ event: `alarm:${msg}` });
});

await app.boot();

console.log('[27] === Sensor stream → parent → remote store ===');

// 20 sequential sensor reads — each emits a stream event
for (let i = 0; i < 20; i++) {
  await app.sensor.read({ value: i * 10 });
}
console.log(`[27] sensor data received: ${sensorData.length}`);

// 10 alarm triggers
for (let i = 0; i < 10; i++) {
  await app.alarm.trigger({ level: i < 5 ? 'warn' : 'critical' });
}
console.log(`[27] alarm data received: ${alarmData.length}`);

// Parallel: sensor + alarm simultaneously
console.log('[27] === Parallel streams ===');
await Promise.all([
  ...Array.from({ length: 15 }, (_, i) => app.sensor.read({ value: 500 + i })),
  ...Array.from({ length: 10 }, (_, i) => app.alarm.trigger({ level: 'par' })),
]);
console.log(`[27] total sensor: ${sensorData.length}`);
console.log(`[27] total alarm: ${alarmData.length}`);

// Wait for async store writes to complete
await new Promise(r => setTimeout(r, 500));

// Verify store got all forwarded events
const storeCount = await app.store.count();
console.log(`[27] remote store events: ${storeCount}`);

// Verify store has both sensor and alarm events
const storeEvents = await app.store.getEvents();
const sensorEvents = storeEvents.filter((e: string) => e.startsWith('sensor:'));
const alarmEvents = storeEvents.filter((e: string) => e.startsWith('alarm:'));
console.log(`[27] store sensor events: ${sensorEvents.length}`);
console.log(`[27] store alarm events: ${alarmEvents.length}`);

// Verify data integrity
const hasFirstSensor = sensorData.includes(0);
const hasLastSensor = sensorData.includes(514);
const hasWarnAlarm = alarmData.some(a => a.includes('warn'));
const hasCritAlarm = alarmData.some(a => a.includes('critical'));
console.log(`[27] integrity: first=${hasFirstSensor}, last=${hasLastSensor}, warn=${hasWarnAlarm}, crit=${hasCritAlarm}`);

console.log('[27] DONE');
await app.stop();
