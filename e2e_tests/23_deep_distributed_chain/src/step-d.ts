import { Entity, BaseEntity, Describe, State, Tool, RedisPubSubAdapter } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
export class StepD extends BaseEntity {
  @Describe() describe() { return `StepD: ${this.count}`; }
  @State({ description: 'count' }) private count = 0;

  @Tool({ description: 'Finalize' })
  async finalize(input: { data: string }) {
    this.count++;
    return { result: `FINAL:${input.data}`, step: 'D', n: this.count };
  }
}
