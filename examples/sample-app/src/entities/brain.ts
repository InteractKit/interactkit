import {
  Entity,
  LLMEntity,
  Hook,
  Configurable,
  State,
  Ref,
  Executor,
  Tool,
  Describe,
  Init,
  type Remote,
} from "@interactkit/sdk";
import { ChatAnthropic } from "@langchain/anthropic";
import { Mouth } from "./mouth.js";
import { Memory } from "./memory.js";

@Entity({ description: "LLM-powered decision making" })
export class Brain extends LLMEntity {
  @State({ description: 'The personality trait that shapes LLM responses' })
  @Configurable({ label: "Personality", group: "Config" })
  private personality = "curious";

  @Describe()
  describe() {
    return `You are a ${this.personality} assistant. Use your tools to think, speak, and remember.`;
  }

  @Executor()
  private llm = new ChatAnthropic({ model: "claude-sonnet-4-20250514" });

  @Ref() private mouth!: Remote<Mouth>;
  @Ref() private memory!: Remote<Memory>;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`    [brain] personality: ${this.personality}`);
  }

  // chat() is inherited from LLMEntity — no need to define it

  @Tool({ description: "Think deeply about a query and return a response" })
  async think(input: { query: string }): Promise<string> {
    const response = `[${this.personality}] ${input.query} — interesting!`;
    await this.memory.store({ text: response });
    return response;
  }

  @Tool({ description: "Think about something and speak it aloud" })
  async thinkAndSpeak(input: { query: string }): Promise<string> {
    const thought = await this.think(input);
    await this.mouth.speak({ message: thought });
    return thought;
  }

  @Tool({ description: "Recall all stored memories" })
  async reflect(): Promise<string[]> {
    return this.memory.getAll();
  }
}
