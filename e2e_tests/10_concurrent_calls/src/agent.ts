import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Memory } from './memory.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private memory!: Memory;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[10] === 50 parallel stores ===');
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => this.memory.store({ text: `item-${i}` }))
    );
    const count = await this.memory.count();
    console.log(`[10] count after 50 parallel: ${count}`);

    console.log('[10] === 100 parallel stores ===');
    await Promise.all(
      Array.from({ length: 100 }, (_, i) => this.memory.store({ text: `batch-${i}` }))
    );
    const count2 = await this.memory.count();
    console.log(`[10] count after 100 more parallel: ${count2}`);

    console.log('[10] === Mixed parallel read/write ===');
    const mixed = await Promise.all([
      this.memory.store({ text: 'rw-0' }),
      this.memory.count(),
      this.memory.store({ text: 'rw-1' }),
      this.memory.count(),
      this.memory.store({ text: 'rw-2' }),
      this.memory.getAll(),
    ]);
    const finalCount = await this.memory.count();
    console.log(`[10] final count: ${finalCount}`);

    // Verify all items exist
    const all = await this.memory.getAll();
    const hasFirst = all.includes('item-0');
    const hasLast = all.includes('batch-99');
    const hasRw = all.includes('rw-2');
    console.log(`[10] has item-0: ${hasFirst}, batch-99: ${hasLast}, rw-2: ${hasRw}`);

    console.log('[10] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
