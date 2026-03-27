import { Entity, BaseEntity, Describe, Ref, State, Tool, RedisPubSubAdapter } from '@interactkit/sdk';
import { AlphaCache } from './alpha-cache.js';

@Entity({ pubsub: RedisPubSubAdapter })
export class AlphaWorker extends BaseEntity {
  @Describe() describe() { return `AlphaWorker: ${this.processed}`; }
  @State({ description: 'processed' }) private processed = 0;
  @Ref() private alphaCache!: AlphaCache;

  @Tool({ description: 'Process' })
  async process(input: { data: string }) {
    this.processed++;
    // Check cache
    const cached = await this.alphaCache.get({ key: input.data });
    if (cached.hit) return { result: cached.value!, source: 'cache', pid: process.pid };
    // Compute
    const result = input.data.toUpperCase() + '-ALPHA';
    await this.alphaCache.put({ key: input.data, value: result });
    return { result, source: 'compute', pid: process.pid };
  }
}
