import { Entity, BaseEntity, Describe, Component, Tool } from '@interactkit/sdk';
import { BetaWorker } from './beta-worker.js';
import { BetaCache } from './beta-cache.js';

@Entity()
export class TeamBeta extends BaseEntity {
  @Describe() describe() { return 'TeamBeta'; }
  @Component() private betaWorker!: BetaWorker;
  @Component() private betaCache!: BetaCache;

  @Tool({ description: 'Process via Beta' })
  async process(input: { data: string }) { return this.betaWorker.process(input); }
}
