import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Team } from './team.js';

@Entity()
export class Orchestrator extends BaseEntity {
  @Describe() describe() { return 'Orchestrator'; }
  @Component() private teamA!: Remote<Team>;
  @Component() private teamB!: Remote<Team>;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[31] === Complex remote infra: Orchestrator → 2 Teams → Worker+Cache each ===');

    // Phase 1: Sequential tasks to Team A
    console.log('[31] Phase 1: Sequential tasks to Team A');
    for (let i = 0; i < 10; i++) {
      const r = await this.teamA.run({ key: `a-${i}`, data: `task-${i}` });
      if (r.source !== 'compute') {
        console.error(`[31] FAIL: expected compute, got ${r.source}`);
        process.exit(1);
      }
    }
    const aStats = await this.teamA.workerStats();
    console.log(`[31] Team A processed: ${aStats.count}`);

    // Phase 2: Repeat same keys — should hit cache via remote ref
    console.log('[31] Phase 2: Cache hits on Team A');
    const r0 = await this.teamA.run({ key: 'a-0', data: 'task-0' });
    console.log(`[31] repeat a-0: source=${r0.source}`);

    // Phase 3: Parallel tasks across both teams
    console.log('[31] Phase 3: Parallel across both teams');
    const parallel = await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => this.teamA.run({ key: `pa-${i}`, data: `parallel-a-${i}` })),
      ...Array.from({ length: 5 }, (_, i) => this.teamB.run({ key: `pb-${i}`, data: `parallel-b-${i}` })),
    ]);
    console.log(`[31] parallel done: ${parallel.length} results`);

    // Phase 4: Verify both teams have independent state
    const aCacheSize = await this.teamA.cacheSize();
    const bCacheSize = await this.teamB.cacheSize();
    console.log(`[31] cache sizes: A=${aCacheSize.size}, B=${bCacheSize.size}`);

    const bStats = await this.teamB.workerStats();
    console.log(`[31] Team B processed: ${bStats.count}`);

    console.log('[31] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
