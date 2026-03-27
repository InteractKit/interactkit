import { Entity, BaseEntity, Describe, Stream, Tool, Hook, Init } from '@interactkit/sdk';
import type { EntityStream } from '@interactkit/sdk';

@Entity()
export class Sensor extends BaseEntity {
  @Describe() describe() { return 'Sensor'; }
  @Stream() readings!: EntityStream<number>;

  @Tool({ description: 'Emit one reading' })
  async emitOne(input: { value: number }) {
    this.readings.emit(input.value);
    return { emitted: input.value };
  }

  @Tool({ description: 'Emit batch' })
  async emitBatch(input: { values: number[] }) {
    for (const v of input.values) this.readings.emit(v);
    return { count: input.values.length };
  }

  @Tool({ description: 'Manual start-data-data-end lifecycle' })
  async emitLifecycle(input: { values: number[] }) {
    this.readings.start();
    for (const v of input.values) this.readings.data(v);
    this.readings.end();
    return { count: input.values.length };
  }
}
