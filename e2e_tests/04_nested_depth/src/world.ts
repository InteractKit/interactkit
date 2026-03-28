import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Manager } from './manager.js';

@Entity()
export class World extends BaseEntity {
  @Describe() describe() { return 'World'; }
  @Component() private manager!: Remote<Manager>;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[04] === 5-level depth: World → Manager → Team → Worker → Logger ===');

    // Send 10 tasks through all 5 levels
    for (let i = 0; i < 10; i++) {
      const r = await this.manager.delegate({ task: `task-${i}` });
      if (r.jobNumber !== i + 1) {
        console.error(`[04] FAIL: expected job ${i + 1}, got ${r.jobNumber}`);
        process.exit(1);
      }
    }
    console.log('[04] 10 tasks delegated through 5 levels');

    // Audit: retrieve logs from level 5 (Logger) through all levels
    const logs = await this.manager.audit();
    console.log(`[04] audit logs count: ${logs.length}`);
    const hasFirst = logs.includes('worker did: task-0');
    const hasLast = logs.includes('worker did: task-9');
    console.log(`[04] has first: ${hasFirst}, has last: ${hasLast}`);

    // Parallel delegation through all 5 levels
    console.log('[04] === Parallel through 5 levels ===');
    const parallel = await Promise.all(
      Array.from({ length: 10 }, (_, i) => this.manager.delegate({ task: `parallel-${i}` }))
    );
    const allJobs = parallel.map(r => r.jobNumber);
    console.log(`[04] parallel job numbers: ${allJobs.length} results`);

    const finalLogs = await this.manager.audit();
    console.log(`[04] final log count: ${finalLogs.length}`);
    const hasParallel = finalLogs.some(l => l.includes('parallel-'));
    console.log(`[04] has parallel logs: ${hasParallel}`);

    console.log('[04] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
