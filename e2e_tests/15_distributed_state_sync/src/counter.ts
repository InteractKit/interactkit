import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Counter extends BaseEntity {
  @Describe() describe() { return `Counter: ${this.value}`; }
  @State({ description: 'value' }) private value = 0;
  @State({ description: 'history' }) private history: number[] = [];

  @Tool({ description: 'Increment' })
  async increment(input: { by: number }) {
    this.value += input.by;
    this.history.push(this.value);
    return this.value;
  }

  @Tool({ description: 'Get' })
  async get() { return { value: this.value, historyLen: this.history.length }; }

  @Tool({ description: 'Get history' })
  async getHistory() { return [...this.history]; }
}
