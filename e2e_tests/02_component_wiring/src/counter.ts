import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity()
export class Counter extends BaseEntity {
  @Describe() describe() { return `Counter: ${this.value}`; }
  @State({ description: 'value' }) private value = 0;

  @Tool({ description: 'Increment' })
  async increment(input: { by: number }) {
    this.value += input.by;
    return { value: this.value };
  }

  @Tool({ description: 'Get' })
  async get() { return this.value; }
}
