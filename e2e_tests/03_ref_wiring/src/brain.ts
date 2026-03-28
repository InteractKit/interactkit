import { Entity, BaseEntity, Describe, Ref, Tool, type Remote } from '@interactkit/sdk';
import { Memory } from './memory.js';

@Entity()
export class Brain extends BaseEntity {
  @Describe() describe() { return 'Brain'; }
  @Ref() private memory!: Remote<Memory>;

  @Tool({ description: 'Think and store' })
  async think(input: { thought: string }) {
    await this.memory.store({ text: `thought: ${input.thought}` });
    return { stored: true };
  }

  @Tool({ description: 'Batch think' })
  async batchThink(input: { thoughts: string[] }) {
    for (const t of input.thoughts) {
      await this.memory.store({ text: `thought: ${t}` });
    }
    const count = await this.memory.count();
    return { stored: input.thoughts.length, totalInMemory: count };
  }

  @Tool({ description: 'Recall all' })
  async recallAll() {
    return this.memory.getAll();
  }
}
