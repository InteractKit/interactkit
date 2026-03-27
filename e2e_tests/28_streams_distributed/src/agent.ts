import { Entity, BaseEntity, Describe, Component, State, Hook, Init } from '@interactkit/sdk';
import { Sensor } from './sensor.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private sensor!: Sensor;

  @State({ description: 'received' })
  private received: number[] = [];
  @State({ description: 'starts' })
  private starts = 0;
  @State({ description: 'ends' })
  private ends = 0;

  @Hook(Init.Runner())
  async onInit() {
    // Subscribe to distributed stream
    this.sensor.readings.on('start', () => { this.starts++; });
    this.sensor.readings.on('data', (payload: unknown) => {
      const p = payload as { value: number; ts: number };
      this.received.push(p.value);
    });
    this.sensor.readings.on('end', () => { this.ends++; });

    console.log('[28] === Sequential reads across Redis ===');
    for (let i = 0; i < 10; i++) {
      await this.sensor.read({ value: i * 10 });
    }
    // Wait for pubsub delivery
    await new Promise(r => setTimeout(r, 300));
    console.log(`[28] received: ${this.received.length}`);
    console.log(`[28] starts: ${this.starts}, ends: ${this.ends}`);
    console.log(`[28] values: ${JSON.stringify(this.received)}`);

    console.log('[28] === Batch read across Redis ===');
    const before = this.received.length;
    await this.sensor.batchRead({ values: [100, 200, 300, 400, 500] });
    await new Promise(r => setTimeout(r, 300));
    const batchReceived = this.received.length - before;
    console.log(`[28] batch received: ${batchReceived}`);

    console.log('[28] === Parallel reads across Redis ===');
    const parBefore = this.received.length;
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => this.sensor.read({ value: 1000 + i }))
    );
    await new Promise(r => setTimeout(r, 500));
    const parReceived = this.received.length - parBefore;
    console.log(`[28] parallel received: ${parReceived}`);

    console.log(`[28] total: ${this.received.length} values, ${this.starts} starts, ${this.ends} ends`);

    // Verify data integrity
    const hasFirst = this.received.includes(0);
    const hasBatch = this.received.includes(300);
    const hasParallel = this.received.includes(1019);
    console.log(`[28] integrity: first=${hasFirst}, batch=${hasBatch}, parallel=${hasParallel}`);

    console.log('[28] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
