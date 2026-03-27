import { Entity, BaseEntity, Describe, Ref, Tool } from '@interactkit/sdk';
import { Memory } from './memory.js';

@Entity()
export class Brain extends BaseEntity {
  @Describe() describe() { return 'Brain'; }
  @Ref() private memory!: Memory;

  @Tool({ description: 'Think' })
  async think(input: { thought: string }) {
    await this.memory.store({ text: input.thought });
    return { stored: true };
  }
}
