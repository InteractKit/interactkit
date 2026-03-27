import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Memory } from './memory.js';
import { Counter } from './counter.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private memory!: Memory;
  @Component() private counter!: Counter;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[02] === Component basic calls ===');

    // Store 30 entries
    for (let i = 0; i < 30; i++) {
      await this.memory.store({ text: `entry-${i}` });
    }
    const count = await this.memory.count();
    console.log(`[02] stored 30, count=${count}`);

    // Search
    const found = await this.memory.search({ query: 'entry-1' });
    console.log(`[02] search "entry-1": ${found.length} results`);
    // entry-1, entry-10..entry-19 = 11 matches

    // Get all and verify
    const all = await this.memory.getAll();
    console.log(`[02] getAll length: ${all.length}`);

    console.log('[02] === Multiple components ===');

    // Counter component works independently
    await this.counter.increment({ by: 10 });
    await this.counter.increment({ by: 5 });
    await this.counter.increment({ by: -3 });
    const counterVal = await this.counter.get();
    console.log(`[02] counter: ${counterVal}`);

    console.log('[02] === Parallel cross-component ===');

    // Parallel: store in memory AND increment counter simultaneously
    const parallel = await Promise.all([
      this.memory.store({ text: 'parallel-1' }),
      this.memory.store({ text: 'parallel-2' }),
      this.counter.increment({ by: 1 }),
      this.counter.increment({ by: 1 }),
      this.memory.store({ text: 'parallel-3' }),
      this.counter.increment({ by: 1 }),
    ]);
    const memCount = await this.memory.count();
    const ctrVal = await this.counter.get();
    console.log(`[02] after parallel: memory=${memCount}, counter=${ctrVal}`);

    console.log('[02] === Clear and reuse ===');

    await this.memory.clear();
    const afterClear = await this.memory.count();
    console.log(`[02] after clear: ${afterClear}`);
    await this.memory.store({ text: 'fresh' });
    const afterFresh = await this.memory.getAll();
    console.log(`[02] after re-store: ${JSON.stringify(afterFresh)}`);

    console.log('[02] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
