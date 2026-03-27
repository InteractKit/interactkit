import { Entity, BaseEntity, Describe, Component, Hook, Init } from '@interactkit/sdk';
import { Orchestrator } from './orchestrator.js';
import { TeamAlpha } from './team-alpha.js';
import { TeamBeta } from './team-beta.js';

@Entity()
export class World extends BaseEntity {
  @Describe() describe() { return 'World'; }
  @Component() private orchestrator!: Orchestrator;
  @Component() private teamAlpha!: TeamAlpha;
  @Component() private teamBeta!: TeamBeta;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[26] === Mega Integration: 10 entities, 5 distributed ===');

    // Phase 1: Process tasks through Alpha team
    console.log('[26] --- Phase 1: Alpha processing ---');
    for (let i = 0; i < 15; i++) {
      const r = await this.teamAlpha.process({ data: `job-${i}` });
      await this.orchestrator.submit({
        id: `alpha-${i}`, data: `job-${i}`, result: r.result, worker: 'alpha',
      });
    }
    const alphaStats = await this.teamAlpha.cacheStats();
    console.log(`[26] alpha cache: hits=${alphaStats.hits}, misses=${alphaStats.misses}`);

    // Phase 2: Process tasks through Beta team
    console.log('[26] --- Phase 2: Beta processing ---');
    for (let i = 0; i < 15; i++) {
      const r = await this.teamBeta.process({ data: `job-${i}` });
      await this.orchestrator.submit({
        id: `beta-${i}`, data: `job-${i}`, result: r.result, worker: 'beta',
      });
    }

    // Phase 3: Parallel — both teams process simultaneously
    console.log('[26] --- Phase 3: Parallel both teams ---');
    const parallel = await Promise.all([
      ...Array.from({ length: 20 }, (_, i) => this.teamAlpha.process({ data: `par-${i}` })),
      ...Array.from({ length: 20 }, (_, i) => this.teamBeta.process({ data: `par-${i}` })),
    ]);
    console.log(`[26] parallel: ${parallel.length} results`);

    // Submit parallel results to orchestrator
    await Promise.all(parallel.map((r, i) =>
      this.orchestrator.submit({
        id: `par-${i}`, data: `par-${i % 20}`, result: r.result, worker: r.source,
      })
    ));

    // Phase 4: Verify data integrity
    console.log('[26] --- Phase 4: Verify ---');
    const queueStats = await this.orchestrator.queueStats();
    console.log(`[26] queue: total=${queueStats.total}, done=${queueStats.done}`);

    const resultCount = await this.orchestrator.resultCount();
    console.log(`[26] results stored: ${resultCount}`);

    const results = await this.orchestrator.getResults();
    const alphaResults = results.filter((r: any) => r.worker === 'alpha');
    const betaResults = results.filter((r: any) => r.worker === 'beta');
    console.log(`[26] alpha results: ${alphaResults.length}, beta results: ${betaResults.length}`);

    // Verify alpha results are uppercase
    const alphaCorrect = alphaResults.every((r: any) => r.result.includes('-ALPHA'));
    console.log(`[26] alpha format correct: ${alphaCorrect}`);

    // Verify beta results are reversed
    const betaCorrect = betaResults.every((r: any) => r.result.includes('-BETA'));
    console.log(`[26] beta format correct: ${betaCorrect}`);

    // Phase 5: Cache hit verification — process same data again
    console.log('[26] --- Phase 5: Cache hits ---');
    const cached = await this.teamAlpha.process({ data: 'job-0' });
    console.log(`[26] repeat job-0: source=${cached.source}`);
    const finalCacheStats = await this.teamAlpha.cacheStats();
    console.log(`[26] final cache: hits=${finalCacheStats.hits}, misses=${finalCacheStats.misses}`);

    // Phase 6: Error path — process empty string (should still work)
    console.log('[26] --- Phase 6: Edge cases ---');
    const empty = await this.teamAlpha.process({ data: '' });
    console.log(`[26] empty data: result="${empty.result}"`);

    const total = resultCount;
    console.log(`[26] === Total: ${total} results across 10 entities ===`);
    console.log('[26] DONE');
    setTimeout(() => process.exit(0), 300);
  }
}
