import { Entity, BaseEntity, Describe, Component, Tool, type Remote } from '@interactkit/sdk';
import { StepC } from './step-c.js';

@Entity({ detached: true })
export class StepB extends BaseEntity {
  @Describe() describe() { return 'StepB'; }
  @Component() private stepC!: Remote<StepC>;

  @Tool({ description: 'Process B' })
  async processB(input: { data: string }) {
    const result = await this.stepC.processC({ data: `B(${input.data})` });
    return { ...result, step: 'B→C→D' };
  }
}
