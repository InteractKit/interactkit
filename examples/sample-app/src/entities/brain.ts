import {
  Entity, BaseEntity, Hook, Configurable, Ref,
  LLMEntity, Context, Executor, LLMTool, LLMVisible, LLMExecutionTrigger,
  LLMContext,
} from '@interactkit/sdk';
import type { InitInput, LLMExecutionTriggerParams } from '@interactkit/sdk';
import { Mouth } from './mouth.js';
import { Memory } from './memory.js';
import { MockLLM } from '../mock-llm.js';

@LLMEntity()
@Entity({ type: 'brain' })
export class Brain extends BaseEntity {
  @Configurable({ label: 'Personality', group: 'Config' })
  @LLMVisible()
  personality = 'curious';

  @Context()
  context = new LLMContext();

  @Executor()
  llm = new MockLLM();  // swap with new ChatOpenAI({ model: 'gpt-4' }) for real use

  // Sibling refs
  @Ref() mouth!: Mouth;
  @Ref() memory!: Memory;

  @Hook()
  async onInit(input: InitInput) {
    console.log(`    [brain] personality: ${this.personality}`);
  }

  /**
   * LLM execution trigger — body is replaced by the runtime.
   * Runtime: appends message to @Context, runs LLM loop with @LLMTool methods, returns response.
   */
  @LLMExecutionTrigger()
  async chat(params: LLMExecutionTriggerParams): Promise<string> {
    return ''; // runtime takes over — this body is never executed
  }

  @LLMTool({ description: 'Think deeply about a query and return a response' })
  async think(input: { query: string }): Promise<string> {
    const response = `[${this.personality}] ${input.query} — interesting!`;
    await this.memory.store({ text: response });
    return response;
  }

  @LLMTool({ description: 'Think about something and speak it aloud' })
  async thinkAndSpeak(input: { query: string }): Promise<string> {
    const thought = await this.think(input);
    await this.mouth.speak({ message: thought });
    return thought;
  }

  @LLMTool({ description: 'Recall all stored memories' })
  async reflect(): Promise<string[]> {
    return this.memory.getAll();
  }
}
