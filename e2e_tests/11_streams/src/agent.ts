import { Entity, BaseEntity, Describe, Component, State, Hook, Init } from '@interactkit/sdk';
import { Sensor } from './sensor.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private sensor!: Sensor;

  @State({ description: 'received readings' })
  private received: number[] = [];

  @Hook(Init.Runner())
  async onInit() {
    console.log('[11] === Stream subscription ===');

    // Subscribe to sensor readings
    this.sensor.readings.on('data', (value: unknown) => {
      this.received.push(value as number);
    });

    // Wait for init emissions to process
    await new Promise(r => setTimeout(r, 100));
    console.log(`[11] received from init: ${this.received.length} readings`);
    console.log(`[11] values: ${JSON.stringify(this.received)}`);

    // Trigger more via tool
    await this.sensor.takeReading({ value: 100 });
    await this.sensor.takeReading({ value: 200 });
    await new Promise(r => setTimeout(r, 50));
    console.log(`[11] total after tool calls: ${this.received.length}`);

    console.log('[11] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
