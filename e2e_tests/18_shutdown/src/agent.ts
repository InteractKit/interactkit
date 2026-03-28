import { Entity, BaseEntity, Describe, State, Tool, Hook, Init, Component, type Remote } from '@interactkit/sdk';

@Entity()
export class Worker extends BaseEntity {
  @Describe() describe() { return `Worker: ${this.tasks}`; }
  @State({ description: 'tasks' }) private tasks = 0;

  @Tool({ description: 'Work' })
  async work(input: { task: string }) { this.tasks++; return this.tasks; }
}

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private worker!: Remote<Worker>;

  @Hook(Init.Runner())
  async onInit() {
    console.log('[18] booted');
    await this.worker.work({ task: 'a' });
    await this.worker.work({ task: 'b' });
    console.log('[18] work done');
    console.log('[18] sending SIGINT');

    // Self-SIGINT to test graceful shutdown
    setTimeout(() => {
      process.kill(process.pid, 'SIGINT');
    }, 200);
  }
}
