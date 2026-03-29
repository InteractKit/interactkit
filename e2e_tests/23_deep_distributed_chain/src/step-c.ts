import { Entity, BaseEntity, Describe, Component, Tool, type Remote } from '@interactkit/sdk';
import { StepD } from './step-d.js';

@Entity({ detached: true })
export class StepC extends BaseEntity {
  @Describe() describe() { return 'StepC'; }
  @Component() private stepD!: Remote<StepD>;

  @Tool({ description: 'Process C' })
  async processC(input: { data: string }) {
    const result = await this.stepD.finalize({ data: `C(${input.data})` });
    return { ...result, step: 'C→D' };
  }
}
