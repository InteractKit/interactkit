import { Entity, BaseEntity, Describe, Component, State, Tool, RedisPubSubAdapter } from '@interactkit/sdk';
import { Logger } from './logger.js';

@Entity({ pubsub: RedisPubSubAdapter })
export class TaskQueue extends BaseEntity {
  @Describe() describe() { return `TaskQueue: ${this.tasks.length} tasks`; }
  @State({ description: 'tasks' }) private tasks: Array<{ id: string; data: string; status: string }> = [];
  @Component() private logger!: Logger;

  @Tool({ description: 'Enqueue task' })
  async enqueue(input: { id: string; data: string }) {
    this.tasks.push({ id: input.id, data: input.data, status: 'pending' });
    await this.logger.log({ msg: `enqueued: ${input.id}` });
    return { queued: this.tasks.length };
  }

  @Tool({ description: 'Dequeue next pending' })
  async dequeue() {
    const task = this.tasks.find(t => t.status === 'pending');
    if (!task) return null;
    task.status = 'processing';
    await this.logger.log({ msg: `dequeued: ${task.id}` });
    return { id: task.id, data: task.data };
  }

  @Tool({ description: 'Complete task' })
  async complete(input: { id: string; result: string }) {
    const task = this.tasks.find(t => t.id === input.id);
    if (task) {
      task.status = 'done';
      await this.logger.log({ msg: `completed: ${input.id}` });
    }
    return { completed: !!task };
  }

  @Tool({ description: 'Stats' })
  async stats() {
    return {
      total: this.tasks.length,
      pending: this.tasks.filter(t => t.status === 'pending').length,
      processing: this.tasks.filter(t => t.status === 'processing').length,
      done: this.tasks.filter(t => t.status === 'done').length,
    };
  }
}
