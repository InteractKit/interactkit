import { Entity, BaseEntity, Describe, Stream, Tool, Hook, Init } from '@interactkit/sdk';
import type { EntityStream } from '@interactkit/sdk';

@Entity()
export class Sensor extends BaseEntity {
  @Describe() describe() { return 'Sensor'; }
  @Stream() readings!: EntityStream<number>;

  @Hook(Init.Runner())
  async onInit() {
    // Emit 5 readings on boot
    for (let i = 1; i <= 5; i++) {
      this.readings.emit(i * 10);
    }
  }

  @Tool({ description: 'Take reading' })
  async takeReading(input: { value: number }) {
    this.readings.emit(input.value);
    return { emitted: input.value };
  }
}
