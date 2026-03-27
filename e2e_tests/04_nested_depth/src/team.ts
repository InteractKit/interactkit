import { Entity, BaseEntity, Describe, Component, State, Tool } from '@interactkit/sdk';
import { Worker } from './worker.js';

@Entity()
export class Team extends BaseEntity {
  @Describe() describe() { return `Team: ${this.tasksAssigned} tasks`; }
  @State({ description: 'tasks assigned' }) private tasksAssigned = 0;
  @Component() private worker!: Worker;

  @Tool({ description: 'Assign task' })
  async assign(input: { task: string }) {
    this.tasksAssigned++;
    const result = await this.worker.doWork({ task: input.task });
    return { ...result, teamTasks: this.tasksAssigned };
  }

  @Tool({ description: 'Get deep logs' })
  async getDeepLogs() { return this.worker.getWorkerLogs(); }
}
