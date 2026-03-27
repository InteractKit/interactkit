import { Entity, BaseEntity, Describe, Component, Tool } from '@interactkit/sdk';
import { AlphaWorker } from './alpha-worker.js';
import { AlphaCache } from './alpha-cache.js';

@Entity()
export class TeamAlpha extends BaseEntity {
  @Describe() describe() { return 'TeamAlpha'; }
  @Component() private alphaWorker!: AlphaWorker;
  @Component() private alphaCache!: AlphaCache;

  @Tool({ description: 'Process via Alpha' })
  async process(input: { data: string }) { return this.alphaWorker.process(input); }

  @Tool({ description: 'Cache stats' })
  async cacheStats() { return this.alphaCache.stats(); }
}
