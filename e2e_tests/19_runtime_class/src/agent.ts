import { Entity, BaseEntity, Describe, Component, Tool } from '@interactkit/sdk';
import { Brain } from './brain.js';
import { Memory } from './memory.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private brain!: Brain;
  @Component() private memory!: Memory;

  @Tool({ description: 'Chat' })
  async chat(input: { msg: string }) {
    await this.brain.think({ thought: input.msg });
    return this.memory.getAll();
  }
}
