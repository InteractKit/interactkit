import { Entity, BaseEntity, Hook, Init, Configurable, State, Tool, z } from '@interactkit/sdk';

@Entity({ description: 'Long-term memory storage with search and decay' })
export class Memory extends BaseEntity {
  @State({ description: 'Maximum number of memory entries before eviction', validate: z.number().min(1).max(1000) })
  @Configurable({ label: 'Max Capacity', group: 'Config' })
  private capacity = 100;

  @State({ description: 'Stored memory entries' })
  private entries: string[] = [];

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`    [memory] capacity: ${this.capacity}`);
  }

  @Tool({ description: 'Store a new memory entry' })
  async store(input: { text: string }): Promise<void> {
    if (this.entries.length >= this.capacity) {
      this.entries.shift(); // evict oldest
    }
    this.entries.push(input.text);
  }

  @Tool({ description: 'Search memories by keyword' })
  async search(input: { query: string }): Promise<string[]> {
    return this.entries.filter(e => e.toLowerCase().includes(input.query.toLowerCase()));
  }

  @Tool({ description: 'Retrieve all stored memories' })
  async getAll(): Promise<string[]> {
    return [...this.entries];
  }

  @Tool({ description: 'Get the number of stored memories' })
  async count(): Promise<number> {
    return this.entries.length;
  }
}
