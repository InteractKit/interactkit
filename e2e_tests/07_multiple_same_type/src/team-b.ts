import { Entity, BaseEntity, Describe, Component, Tool } from '@interactkit/sdk';
import { Memory } from './memory.js';

@Entity()
export class TeamB extends BaseEntity {
  @Describe() describe() { return 'TeamB'; }
  @Component() private memory!: Memory;

  @Tool({ description: 'Store in B' })
  async storeB(input: { text: string }) { return this.memory.store({ text: `B:${input.text}` }); }

  @Tool({ description: 'Get B entries' })
  async getB() { return this.memory.getAll(); }

  @Tool({ description: 'Count B' })
  async countB() { return this.memory.count(); }
}
