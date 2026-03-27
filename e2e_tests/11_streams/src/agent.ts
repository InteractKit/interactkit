import { Entity, BaseEntity, Describe, Component, State, Hook, Init } from '@interactkit/sdk';
import { Sensor } from './sensor.js';
import { Logger } from './logger.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private sensor!: Sensor;
  @Component() private logger!: Logger;

  @State({ description: 'received readings' })
  private readings: number[] = [];

  @State({ description: 'received logs' })
  private logs: string[] = [];

  @State({ description: 'lifecycle events' })
  private lifecycle: string[] = [];

  @Hook(Init.Runner())
  async onInit() {
    // === Subscribe to sensor readings (data only) ===
    console.log('[11] === Data subscription ===');
    this.sensor.readings.on('data', (value: unknown) => {
      this.readings.push(value as number);
    });

    // === Subscribe to logger entries (data only) ===
    this.logger.entries.on('data', (value: unknown) => {
      this.logs.push(value as string);
    });

    // === Full lifecycle subscription on sensor ===
    this.sensor.readings.on('start', () => this.lifecycle.push('START'));
    this.sensor.readings.on('end', () => this.lifecycle.push('END'));

    // --- Test: emit via tool calls ---
    console.log('[11] === Single emissions ===');
    await this.sensor.emitOne({ value: 10 });
    await this.sensor.emitOne({ value: 20 });
    await this.sensor.emitOne({ value: 30 });
    console.log(`[11] readings after 3 emits: ${JSON.stringify(this.readings)}`);
    console.log(`[11] lifecycle after 3 emits: ${JSON.stringify(this.lifecycle)}`);

    // --- Test: batch emissions ---
    console.log('[11] === Batch emissions ===');
    await this.sensor.emitBatch({ values: [100, 200, 300, 400, 500] });
    console.log(`[11] readings after batch: ${this.readings.length}`);

    // --- Test: manual lifecycle (start-data-data-end) ---
    console.log('[11] === Manual lifecycle ===');
    this.lifecycle = []; // reset
    await this.sensor.emitLifecycle({ values: [1, 2, 3] });
    console.log(`[11] lifecycle: ${JSON.stringify(this.lifecycle)}`);
    // Should be: START, then 3 data events (tracked separately), then END
    const hasStart = this.lifecycle.includes('START');
    const hasEnd = this.lifecycle.includes('END');
    console.log(`[11] has start: ${hasStart}, has end: ${hasEnd}`);

    // --- Test: multiple child streams ---
    console.log('[11] === Multiple child streams ===');
    await this.logger.log({ msg: 'hello' });
    await this.logger.log({ msg: 'world' });
    console.log(`[11] logs: ${JSON.stringify(this.logs)}`);

    // --- Test: rapid fire ---
    console.log('[11] === Rapid fire 50 emissions ===');
    const before = this.readings.length;
    for (let i = 0; i < 50; i++) {
      await this.sensor.emitOne({ value: i });
    }
    const after = this.readings.length;
    console.log(`[11] rapid fire: ${after - before} received`);

    // --- Test: parallel emissions ---
    console.log('[11] === Parallel emissions ===');
    const parBefore = this.readings.length;
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => this.sensor.emitOne({ value: 1000 + i }))
    );
    const parAfter = this.readings.length;
    console.log(`[11] parallel: ${parAfter - parBefore} received`);

    // --- Total ---
    console.log(`[11] total readings: ${this.readings.length}`);
    console.log(`[11] total logs: ${this.logs.length}`);

    console.log('[11] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
