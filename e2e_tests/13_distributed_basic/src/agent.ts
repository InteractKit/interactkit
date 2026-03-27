import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Memory } from './memory.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private memory!: Memory;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[13] === Basic distributed calls ===');

    // Store 20 entries across Redis
    for (let i = 0; i < 20; i++) {
      await this.memory.store({ text: `item-${i}` });
    }
    const count = await this.memory.count();
    console.log(`[13] stored 20, count: ${count}`);

    // Search
    const found = await this.memory.search({ query: 'item-1' });
    console.log(`[13] search "item-1": ${found.length} results`);

    // Get all
    const all = await this.memory.getAll();
    console.log(`[13] getAll: ${all.length} entries`);

    // Parallel stores across Redis
    console.log('[13] === Parallel distributed ===');
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => this.memory.store({ text: `par-${i}` }))
    );
    const finalCount = await this.memory.count();
    console.log(`[13] after 30 parallel: ${finalCount}`);

    // Verify data integrity
    const finalAll = await this.memory.getAll();
    const hasFirst = finalAll.includes('item-0');
    const hasLast = finalAll.includes('par-29');
    console.log(`[13] integrity: first=${hasFirst}, last=${hasLast}`);

    console.log('[13] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
