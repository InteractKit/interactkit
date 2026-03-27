import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Brain } from './brain.js';
import { Memory } from './memory.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private brain!: Brain;
  @Component() private memory!: Memory;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[03] === Ref basic call ===');

    // Brain stores via Ref to Memory
    await this.brain.think({ thought: 'hello' });
    await this.brain.think({ thought: 'world' });
    let count = await this.memory.count();
    console.log(`[03] after 2 thinks, memory count: ${count}`);

    console.log('[03] === Ref batch + verify ===');

    // Batch store 20 thoughts via brain
    const thoughts = Array.from({ length: 20 }, (_, i) => `idea-${i}`);
    const batchResult = await this.brain.batchThink({ thoughts });
    console.log(`[03] batch stored: ${batchResult.stored}, total: ${batchResult.totalInMemory}`);

    // Recall all via brain (brain reads memory via ref)
    const all = await this.brain.recallAll();
    console.log(`[03] recall count: ${all.length}`);

    // Verify brain and parent see the same memory
    const parentAll = await this.memory.getAll();
    console.log(`[03] parent sees: ${parentAll.length}`);
    console.log(`[03] match: ${all.length === parentAll.length}`);

    console.log('[03] === Ref parallel stress ===');

    // 15 parallel thinks via brain
    const parallel = await Promise.all(
      Array.from({ length: 15 }, (_, i) => this.brain.think({ thought: `parallel-${i}` }))
    );
    const finalCount = await this.memory.count();
    console.log(`[03] after 15 parallel thinks: ${finalCount}`);

    // Verify first and last entries exist
    const finalAll = await this.memory.getAll();
    const hasFirst = finalAll.includes('thought: hello');
    const hasLast = finalAll.some(e => e.includes('parallel-14'));
    console.log(`[03] has first: ${hasFirst}, has last: ${hasLast}`);

    console.log('[03] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
