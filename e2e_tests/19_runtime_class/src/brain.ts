import { Entity, BaseEntity, Describe, Ref, Tool, type Remote } from '@interactkit/sdk';
import { Memory } from './memory.js';

@Entity()
export class Brain extends BaseEntity {
  @Describe() describe() { return 'Brain'; }
  @Ref() private memory!: Remote<Memory>;

  @Tool({ description: 'Think' })
  async think(input: { thought: string }) {
    await this.memory.store({ text: input.thought });
    return { stored: true };
  }
}
