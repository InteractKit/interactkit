import { Entity, BaseEntity, Hook, Init, State, Tool, Stream } from '@interactkit/sdk';
import type { EntityStream } from '@interactkit/sdk';

@Entity({ description: 'Speech output and voice synthesis' })
export class Mouth extends BaseEntity {
  @Stream() transcript!: EntityStream<string>;

  @State({ description: 'Log of all spoken messages' })
  private history: string[] = [];

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`    [mouth] ready`);
  }

  @Tool({ description: 'Speak a message aloud' })
  async speak(input: { message: string }): Promise<void> {
    this.history.push(input.message);
    console.log(`    [mouth] "${input.message}"`);
    // Emit on the transcript stream so parent can listen
    if (this.transcript) {
      this.transcript.emit(input.message);
    }
  }

  @Tool({ description: 'Get speech history' })
  async getHistory(): Promise<string[]> {
    return [...this.history];
  }
}
