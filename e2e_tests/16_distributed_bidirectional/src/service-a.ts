import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class ServiceA extends BaseEntity {
  @Describe() describe() { return `ServiceA: ${this.calls} calls`; }
  @State({ description: 'calls' }) private calls = 0;

  @Tool({ description: 'Process A' })
  async processA(input: { data: string }) {
    this.calls++;
    return { from: 'A', data: input.data.toUpperCase(), callNum: this.calls };
  }

  @Tool({ description: 'Get A stats' })
  async statsA() { return { calls: this.calls }; }
}
