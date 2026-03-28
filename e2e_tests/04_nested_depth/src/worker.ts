import { Entity, BaseEntity, Describe, Component, State, Tool, type Remote } from '@interactkit/sdk';
import { Logger } from './logger.js';

@Entity()
export class Worker extends BaseEntity {
  @Describe() describe() { return `Worker: ${this.jobs} jobs`; }
  @State({ description: 'jobs' }) private jobs = 0;
  @Component() private logger!: Remote<Logger>;

  @Tool({ description: 'Do work' })
  async doWork(input: { task: string }) {
    this.jobs++;
    await this.logger.log({ msg: `worker did: ${input.task}` });
    return { task: input.task, jobNumber: this.jobs };
  }

  @Tool({ description: 'Get worker logs' })
  async getWorkerLogs() { return this.logger.getLogs(); }
}
