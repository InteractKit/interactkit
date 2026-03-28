import { Entity, BaseEntity, Describe, Ref, State, Tool, type Remote } from '@interactkit/sdk';
import { Cache } from './cache.js';

@Entity()
export class Worker extends BaseEntity {
  @Describe() describe() { return `Worker: ${this.processed} processed`; }
  @State({ description: 'processed count' }) private processed = 0;
  @Ref() private cache!: Remote<Cache>;

  @Tool({ description: 'Process a task, using cache for dedup' })
  async process(input: { key: string; data: string }) {
    const cached = await this.cache.get({ key: input.key });
    if (cached.hit) {
      return { result: cached.value!, source: 'cache', pid: process.pid };
    }
    const result = `${input.data.toUpperCase()}-${this.processed}`;
    this.processed++;
    await this.cache.put({ key: input.key, value: result });
    return { result, source: 'compute', pid: process.pid };
  }

  @Tool({ description: 'Get processed count' })
  async getProcessed() {
    return { count: this.processed };
  }
}
