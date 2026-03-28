import { Entity, BaseEntity, Describe, Component, Tool, type Remote } from '@interactkit/sdk';
import { BetaWorker } from './beta-worker.js';
import { BetaCache } from './beta-cache.js';

@Entity()
export class TeamBeta extends BaseEntity {
  @Describe() describe() { return 'TeamBeta'; }
  @Component() private betaWorker!: Remote<BetaWorker>;
  @Component() private betaCache!: Remote<BetaCache>;

  @Tool({ description: 'Process via Beta' })
  async process(input: { data: string }) { return this.betaWorker.process(input); }
}
