import { Entity, BaseEntity, Describe, Ref, State, Tool, type Remote } from '@interactkit/sdk';
import { BetaCache } from './beta-cache.js';

@Entity({ detached: true })
export class BetaWorker extends BaseEntity {
  @Describe() describe() { return `BetaWorker: ${this.processed}`; }
  @State({ description: 'processed' }) private processed = 0;
  @Ref() private betaCache!: Remote<BetaCache>;

  @Tool({ description: 'Process' })
  async process(input: { data: string }) {
    this.processed++;
    const cached = await this.betaCache.get({ key: input.data });
    if (cached.hit) return { result: cached.value!, source: 'cache', pid: process.pid };
    const result = input.data.split('').reverse().join('') + '-BETA';
    await this.betaCache.put({ key: input.data, value: result });
    return { result, source: 'compute', pid: process.pid };
  }
}
