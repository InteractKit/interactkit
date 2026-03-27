import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Counter } from './counter.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private counter!: Counter;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[15] === Sequential increments with Prisma ===');
    for (let i = 1; i <= 10; i++) await this.counter.increment({ by: i });
    const state = await this.counter.get();
    console.log(`[15] value: ${state.value}, history: ${state.historyLen}`);
    console.log(`[15] correct: ${state.value === 55}`);

    console.log('[15] === Parallel increments ===');
    await Promise.all(Array.from({ length: 20 }, () => this.counter.increment({ by: 1 })));
    const after = await this.counter.get();
    console.log(`[15] after parallel: ${after.value}`);

    console.log('[15] DONE');
    setTimeout(() => process.exit(0), 500);
  }
}
