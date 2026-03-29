import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Calculator extends BaseEntity {
  @Describe() describe() { return 'Calculator'; }
  @State({ description: 'counter' }) private counter = 0;

  @Tool({ description: 'Add one' })
  async add() { this.counter++; return this.counter; }

  @Tool({ description: 'Get count' })
  async get() { return this.counter; }
}
