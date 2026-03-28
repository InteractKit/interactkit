import { Entity, BaseEntity, Describe, Component, Tool, Hook, Init, type Remote } from '@interactkit/sdk';
import { Brain } from './brain.js';
import { Memory } from './memory.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private brain!: Remote<Brain>;
  @Component() private memory!: Remote<Memory>;

  @Hook(Init.Runner())
  async onInit() {
    // Store via memory directly
    await this.memory.store({ text: 'direct' });
    const all = await this.memory.getAll();
    console.log(`[19] direct call: ${JSON.stringify(all)}`);

    // Store via brain (which uses @Ref to memory)
    await this.brain.think({ thought: 'via-ref' });
    const all2 = await this.memory.getAll();
    console.log(`[19] ref call: ${JSON.stringify(all2)}`);

    console.log('[19] shutdown clean');
    setTimeout(() => process.exit(0), 200);
  }

  @Tool({ description: 'Chat' })
  async chat(input: { msg: string }) {
    await this.brain.think({ thought: input.msg });
    return this.memory.getAll();
  }
}
