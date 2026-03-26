import {
  Entity,
  BaseEntity,
  Hook,
  Init,
  Configurable,
  Component,
  State,
  Tool,
  z,
} from "@interactkit/sdk";
import { Brain } from "./brain.js";
import { Mouth } from "./mouth.js";
import { Memory } from "./memory.js";
import { Sensor } from "./sensor.js";

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
@Entity({ description: "Root agent entity with all components" })
export class Agent extends BaseEntity {
  @State({ description: "The agent display name", validate: z.string().min(2).max(50) })
  @Configurable({ label: "Agent Name", group: "Identity" })
  private name = "Atlas";

  @Component() private brain!: Brain;
  @Component() private mouth!: Mouth;
  @Component() private memory!: Memory;
  @Component() private sensor!: Sensor;

  @State({ description: "Recorded speech transcripts" })
  private transcripts: string[] = [];

  @State({ description: "Collected sensor readings" })
  private sensorReadings: number[] = [];

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(
      `\n  [agent] ${this.name} booting (firstBoot: ${input.firstBoot})`,
    );

    // Subscribe to child streams — streams are always public to parent
    this.mouth.transcript.on("data", (text: unknown) => {
      this.transcripts.push(text as string);
    });
    this.sensor.readings.on("data", (value: unknown) => {
      this.sensorReadings.push(value as number);
    });
    this.brain.invoke({ message: "Hello, world!" }).then((response) => {
      console.log(`    [agent] initial brain response: ${response}`);
    });
  }

  @Tool({ description: "Ask the agent a question" })
  async ask(input: { question: string }): Promise<string> {
    return this.brain.thinkAndSpeak({ query: input.question });
  }

  @Tool({ description: "Take a sensor reading" })
  async readSensor(): Promise<number> {
    return this.sensor.read();
  }

  @Tool({ description: "Get all speech transcripts" })
  async getTranscripts(): Promise<string[]> {
    return this.transcripts;
  }

  @Tool({ description: "Introduce the agent" })
  async introduce(): Promise<string> {
    return `Hi, I'm ${this.name}!`;
  }

  @Tool({ description: "Recall all stored memories via brain" })
  async reflect(): Promise<string[]> {
    return this.brain.reflect();
  }

  @Tool({ description: "Get mouth speech history" })
  async getSpeechHistory(): Promise<string[]> {
    return this.mouth.getHistory();
  }

  @Tool({ description: "Search memory by keyword" })
  async searchMemory(input: { query: string }): Promise<string[]> {
    return this.memory.search(input);
  }

  @Tool({ description: "Get memory entry count" })
  async getMemoryCount(): Promise<number> {
    return this.memory.count();
  }

  @Tool({ description: "Chat with the brain LLM" })
  async chat(input: { message: string }): Promise<string> {
    return this.brain.invoke(input);
  }
}
