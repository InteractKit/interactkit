import { Entity, BaseEntity, Hook, Configurable } from '@interactkit/sdk';
import type { InitInput } from '@interactkit/sdk';
import { Min, Max } from 'class-validator';

@Entity({ type: 'memory' })
export class Memory extends BaseEntity {
  @Configurable({ label: 'Max Capacity', group: 'Config' })
  @Min(1) @Max(1000)
  capacity = 100;

  entries: string[] = [];

  @Hook()
  async onInit(input: InitInput) {
    console.log(`    [memory] capacity: ${this.capacity}`);
  }

  async store(input: { text: string }): Promise<void> {
    if (this.entries.length >= this.capacity) {
      this.entries.shift(); // evict oldest
    }
    this.entries.push(input.text);
  }

  async search(input: { query: string }): Promise<string[]> {
    return this.entries.filter(e => e.toLowerCase().includes(input.query.toLowerCase()));
  }

  async getAll(): Promise<string[]> {
    return [...this.entries];
  }

  async count(): Promise<number> {
    return this.entries.length;
  }
}
