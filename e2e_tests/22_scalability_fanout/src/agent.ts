import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Worker } from './worker.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private worker!: Worker;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[22] === Sequential calls ===');
    for (let i = 0; i < 50; i++) {
      await this.worker.process({ data: `job-${i}` });
    }
    let stats = await this.worker.stats();
    console.log(`[22] sequential: ${stats.processed}`);

    console.log('[22] === Parallel fanout (100 calls) ===');
    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => this.worker.process({ data: `par-${i}` }))
    );
    const elapsed = Date.now() - start;
    console.log(`[22] parallel 100: ${results.length} results in ${elapsed}ms`);

    // Verify all results came back
    const allUppercase = results.every(r => r.data === r.data.toUpperCase());
    console.log(`[22] all uppercase: ${allUppercase}`);

    stats = await this.worker.stats();
    console.log(`[22] total processed: ${stats.processed}`);

    console.log('[22] === Burst: 200 rapid-fire ===');
    const burst = await Promise.all(
      Array.from({ length: 200 }, (_, i) => this.worker.process({ data: `burst-${i}` }))
    );
    const finalStats = await this.worker.stats();
    console.log(`[22] burst results: ${burst.length}`);
    console.log(`[22] final processed: ${finalStats.processed}`);

    console.log('[22] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
