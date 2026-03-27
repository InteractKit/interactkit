import { Entity, BaseEntity, Describe, Component, Ref, Tool } from '@interactkit/sdk';
import { TaskQueue } from './task-queue.js';
import { ResultStore } from './result-store.js';

@Entity()
export class Orchestrator extends BaseEntity {
  @Describe() describe() { return 'Orchestrator'; }
  @Component() private taskQueue!: TaskQueue;
  @Component() private resultStore!: ResultStore;

  @Tool({ description: 'Submit and process task' })
  async submit(input: { id: string; data: string; result: string; worker: string }) {
    await this.taskQueue.enqueue({ id: input.id, data: input.data });
    await this.resultStore.store({ taskId: input.id, result: input.result, worker: input.worker });
    await this.taskQueue.complete({ id: input.id, result: input.result });
    return { stored: true };
  }

  @Tool({ description: 'Get queue stats' })
  async queueStats() { return this.taskQueue.stats(); }

  @Tool({ description: 'Get results' })
  async getResults() { return this.resultStore.getResults(); }

  @Tool({ description: 'Get result count' })
  async resultCount() { return this.resultStore.count(); }

  @Tool({ description: 'Get logs' })
  async getLogs() {
    // Reach 2 levels down: Orchestrator → TaskQueue → Logger
    return (this.taskQueue as any).logger
      ? 'N/A'  // Can't access grandchild directly
      : 'N/A';
  }
}
