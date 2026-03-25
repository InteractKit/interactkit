import { Entity, BaseEntity, Hook } from '@interactkit/sdk';
import type { EntityStream, InitInput } from '@interactkit/sdk';

@Entity({ type: 'mouth' })
export class Mouth extends BaseEntity {
  transcript!: EntityStream<string>;
  history: string[] = [];

  @Hook()
  async onInit(input: InitInput) {
    console.log(`    [mouth] ready`);
  }

  async speak(input: { message: string }): Promise<void> {
    this.history.push(input.message);
    console.log(`    [mouth] "${input.message}"`);
    // Emit on the transcript stream so parent can listen
    if (this.transcript) {
      this.transcript.emit(input.message);
    }
  }

  async getHistory(): Promise<string[]> {
    return [...this.history];
  }
}
