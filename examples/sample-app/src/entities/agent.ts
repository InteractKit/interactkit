import { Entity, BaseEntity, Hook, Configurable, Component } from '@interactkit/sdk';
import type { InitInput } from '@interactkit/sdk';
import { MinLength, MaxLength } from 'class-validator';
import { Brain } from './brain.js';
import { Mouth } from './mouth.js';
import { Memory } from './memory.js';
import { Sensor } from './sensor.js';

/**
 * Root entity — Agent with brain, mouth, memory, and sensor.
 *
 * Entity tree:
 *   Agent (root)
 *     ├── Brain  (has EntityRef<Mouth> and EntityRef<Memory> for sibling calls)
 *     ├── Mouth  (has EntityStream<string> for transcripts)
 *     ├── Memory (configurable capacity, stores/searches entries)
 *     └── Sensor (has EntityStream<number> for readings)
 */
@Entity({ type: 'agent', persona: true })
export class Agent extends BaseEntity {
  @Configurable({ label: 'Agent Name', group: 'Identity' })
  @MinLength(2) @MaxLength(50)
  name = 'Atlas';

  @Component() brain!: Brain;
  @Component() mouth!: Mouth;
  @Component() memory!: Memory;
  @Component() sensor!: Sensor;

  transcripts: string[] = [];
  sensorReadings: number[] = [];

  @Hook()
  async onInit(input: InitInput) {
    console.log(`\n  [agent] ${this.name} booting (firstBoot: ${input.firstBoot})`);
  }

  async ask(input: { question: string }): Promise<string> {
    return this.brain.thinkAndSpeak({ query: input.question });
  }

  async readSensor(): Promise<number> {
    return this.sensor.read();
  }

  async getTranscripts(): Promise<string[]> {
    return this.transcripts;
  }

  async introduce(): Promise<string> {
    return `Hi, I'm ${this.name}!`;
  }
}
