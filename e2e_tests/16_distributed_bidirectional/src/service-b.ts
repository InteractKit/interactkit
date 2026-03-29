import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class ServiceB extends BaseEntity {
  @Describe() describe() { return `ServiceB: ${this.calls} calls`; }
  @State({ description: 'calls' }) private calls = 0;

  @Tool({ description: 'Process B' })
  async processB(input: { data: string }) {
    this.calls++;
    return { from: 'B', data: input.data.split('').reverse().join(''), callNum: this.calls };
  }

  @Tool({ description: 'Get B stats' })
  async statsB() { return { calls: this.calls }; }
}
