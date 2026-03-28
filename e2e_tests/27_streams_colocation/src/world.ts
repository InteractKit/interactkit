import { Entity, BaseEntity, Describe, Component, State, Hook, Init, type Remote } from '@interactkit/sdk';
import { Sensor } from './sensor.js';
import { Alarm } from './alarm.js';
import { Store } from './store.js';

@Entity()
export class World extends BaseEntity {
  @Describe() describe() { return 'World'; }
  @Component() private sensor!: Remote<Sensor>;
  @Component() private alarm!: Remote<Alarm>;
  @Component() private store!: Remote<Store>;

  @State({ description: 'stream events' })
  private sensorData: number[] = [];
  @State({ description: 'alarm events' })
  private alarmData: string[] = [];
  @State({ description: 'lifecycle' })
  private lifecycle: string[] = [];

  @Hook(Init.Runner())
  async onInit() {
    // Subscribe to both child streams
    this.sensor.readings.on('data', (payload: unknown) => {
      const p = payload as { value: number; ts: number };
      this.sensorData.push(p.value);
      // Forward to remote store
      this.store.record({ event: `sensor:${p.value}` });
    });
    this.sensor.readings.on('start', () => this.lifecycle.push('sensor:start'));
    this.sensor.readings.on('end', () => this.lifecycle.push('sensor:end'));

    this.alarm.alerts.on('data', (msg: unknown) => {
      this.alarmData.push(msg as string);
      this.store.record({ event: `alarm:${msg}` });
    });

    console.log('[27] === Sensor stream → parent → remote store ===');

    // 20 sequential sensor reads — each emits a stream event
    for (let i = 0; i < 20; i++) {
      await this.sensor.read({ value: i * 10 });
    }
    console.log(`[27] sensor data received: ${this.sensorData.length}`);
    console.log(`[27] lifecycle events: ${this.lifecycle.length}`);

    // 10 alarm triggers
    for (let i = 0; i < 10; i++) {
      await this.alarm.trigger({ level: i < 5 ? 'warn' : 'critical' });
    }
    console.log(`[27] alarm data received: ${this.alarmData.length}`);

    // Parallel: sensor + alarm simultaneously
    console.log('[27] === Parallel streams ===');
    await Promise.all([
      ...Array.from({ length: 15 }, (_, i) => this.sensor.read({ value: 500 + i })),
      ...Array.from({ length: 10 }, (_, i) => this.alarm.trigger({ level: 'par' })),
    ]);
    console.log(`[27] total sensor: ${this.sensorData.length}`);
    console.log(`[27] total alarm: ${this.alarmData.length}`);

    // Wait for async store writes to complete
    await new Promise(r => setTimeout(r, 500));

    // Verify remote store got all forwarded events
    const storeCount = await this.store.count();
    console.log(`[27] remote store events: ${storeCount}`);

    // Verify store has both sensor and alarm events
    const storeEvents = await this.store.getEvents();
    const sensorEvents = storeEvents.filter((e: string) => e.startsWith('sensor:'));
    const alarmEvents = storeEvents.filter((e: string) => e.startsWith('alarm:'));
    console.log(`[27] store sensor events: ${sensorEvents.length}`);
    console.log(`[27] store alarm events: ${alarmEvents.length}`);

    // Verify data integrity
    const hasFirstSensor = this.sensorData.includes(0);
    const hasLastSensor = this.sensorData.includes(514);
    const hasWarnAlarm = this.alarmData.some(a => a.includes('warn'));
    const hasCritAlarm = this.alarmData.some(a => a.includes('critical'));
    console.log(`[27] integrity: first=${hasFirstSensor}, last=${hasLastSensor}, warn=${hasWarnAlarm}, crit=${hasCritAlarm}`);

    console.log('[27] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
