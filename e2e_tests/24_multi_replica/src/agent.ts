import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Worker } from './worker.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private worker!: Worker;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[24] === 30 sequential tasks to 3 worker replicas ===');
    const results: any[] = [];
    for (let i = 0; i < 30; i++) {
      results.push(await this.worker.doWork({ task: `task-${i}` }));
    }
    const pids = new Set(results.map(r => r.pid));
    console.log(`[24] sequential: ${results.length} tasks, ${pids.size} pids`);

    console.log('[24] === 50 parallel tasks ===');
    const parallel = await Promise.all(
      Array.from({ length: 50 }, (_, i) => this.worker.doWork({ task: `par-${i}` }))
    );
    const parPids = new Set(parallel.map(r => r.pid));
    console.log(`[24] parallel: ${parallel.length} tasks, ${parPids.size} pids`);

    const allPids = new Set([...pids, ...parPids]);
    console.log(`[24] total unique pids: ${allPids.size}`);
    console.log(`[24] distributed: ${allPids.size >= 2}`);

    console.log('[24] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
