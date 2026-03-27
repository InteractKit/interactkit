import { Entity, BaseEntity, Describe, Component, Tool, RedisPubSubAdapter } from '@interactkit/sdk';
import { StepC } from './step-c.js';

@Entity({ pubsub: RedisPubSubAdapter })
export class StepB extends BaseEntity {
  @Describe() describe() { return 'StepB'; }
  @Component() private stepC!: StepC;

  @Tool({ description: 'Process B' })
  async processB(input: { data: string }) {
    const result = await this.stepC.processC({ data: `B(${input.data})` });
    return { ...result, step: 'B→C→D' };
  }
}
