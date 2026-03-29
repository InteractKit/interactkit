import { Entity, BaseEntity, Describe, Component, Tool, type Remote } from '@interactkit/sdk';
import { Worker } from './worker.js';
import { Cache } from './cache.js';

@Entity({ detached: true })
export class Team extends BaseEntity {
  @Describe() describe() { return 'Team'; }
  @Component() private worker!: Remote<Worker>;
  @Component() private cache!: Remote<Cache>;

  @Tool({ description: 'Run a task through the worker' })
  async run(input: { key: string; data: string }) {
    return this.worker.process(input);
  }

  @Tool({ description: 'Check cache size' })
  async cacheSize() {
    return this.cache.size();
  }

  @Tool({ description: 'Get worker stats' })
  async workerStats() {
    return this.worker.getProcessed();
  }
}
