import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Worker } from './worker.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private worker!: Remote<Worker>;

  @Hook(Init.Runner())
  async onInit() {
    const workerId = await this.worker.getId();
    console.log(`worker id: ${workerId}`);
    console.log('DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
