import { Entity, BaseEntity, Describe, State, Tool, RedisPubSubAdapter } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
export class Worker extends BaseEntity {
  @Describe() describe() { return `Worker: ${this.handled} handled`; }
  @State({ description: 'handled count' }) private handled = 0;

  @Tool({ description: 'Do work' })
  async doWork(input: { task: string }) {
    this.handled++;
    await new Promise(r => setTimeout(r, Math.random() * 10));
    return { pid: process.pid, task: input.task, n: this.handled };
  }

  @Tool({ description: 'Stats' })
  async stats() { return { pid: process.pid, handled: this.handled }; }
}
