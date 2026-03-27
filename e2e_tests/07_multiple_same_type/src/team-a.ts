import { Entity, BaseEntity, Describe, Component, Tool } from '@interactkit/sdk';
import { Memory } from './memory.js';

@Entity()
export class TeamA extends BaseEntity {
  @Describe() describe() { return 'TeamA'; }
  @Component() private memory!: Memory;

  @Tool({ description: 'Store in A' })
  async storeA(input: { text: string }) { return this.memory.store({ text: `A:${input.text}` }); }

  @Tool({ description: 'Get A entries' })
  async getA() { return this.memory.getAll(); }

  @Tool({ description: 'Count A' })
  async countA() { return this.memory.count(); }
}
