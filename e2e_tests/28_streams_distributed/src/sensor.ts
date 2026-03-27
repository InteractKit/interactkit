import { Entity, BaseEntity, Describe, Stream, State, Tool, RedisPubSubAdapter } from '@interactkit/sdk';
import type { EntityStream } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
export class Sensor extends BaseEntity {
  @Describe() describe() { return `Sensor: ${this.emitted} emitted`; }
  @Stream() readings!: EntityStream<{ value: number; ts: number }>;
  @State({ description: 'emitted' }) private emitted = 0;

  @Tool({ description: 'Read' })
  async read(input: { value: number }) {
    this.emitted++;
    this.readings.emit({ value: input.value, ts: Date.now() });
    return { emitted: this.emitted };
  }

  @Tool({ description: 'Batch read' })
  async batchRead(input: { values: number[] }) {
    for (const v of input.values) {
      this.emitted++;
      this.readings.emit({ value: v, ts: Date.now() });
    }
    return { emitted: this.emitted };
  }
}
