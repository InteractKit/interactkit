import { Entity, BaseEntity, Hook, Configurable } from '@interactkit/sdk';
import type { EntityStream, InitInput } from '@interactkit/sdk';
import { Min } from 'class-validator';

@Entity({ type: 'sensor' })
export class Sensor extends BaseEntity {
  @Configurable({ label: 'Sensor Label', group: 'Config' })
  label = 'temperature';

  readings!: EntityStream<number>;
  readingCount = 0;

  @Hook()
  async onInit(input: InitInput) {
    console.log(`    [sensor] "${this.label}" online`);
  }

  async read(): Promise<number> {
    const value = Math.round(Math.random() * 100);
    this.readingCount++;
    if (this.readings) {
      this.readings.emit(value);
    }
    return value;
  }

  async getReadingCount(): Promise<number> {
    return this.readingCount;
  }
}
