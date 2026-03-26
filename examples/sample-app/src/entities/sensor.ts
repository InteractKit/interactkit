import { Entity, BaseEntity, Hook, Init, Configurable, State, Tool, Stream } from "@interactkit/sdk";
import type { EntityStream } from "@interactkit/sdk";

@Entity({ description: 'Environmental data collection via tick hooks' })
export class Sensor extends BaseEntity {
  @State({ description: 'Human-readable sensor label' })
  @Configurable({ label: "Sensor Label", group: "Config" })
  private label = "temperature";

  @Stream() readings!: EntityStream<number>;

  @State({ description: 'Total number of readings taken' })
  private readingCount = 0;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`    [sensor] "${this.label}" online`);
  }

  @Tool({ description: 'Take a sensor reading' })
  async read(): Promise<number> {
    const value = Math.round(Math.random() * 100);
    this.readingCount++;
    if (this.readings) {
      this.readings.emit(value);
    }
    return value;
  }

  @Tool({ description: 'Get total number of readings taken' })
  async getReadingCount(): Promise<number> {
    return this.readingCount;
  }
}
