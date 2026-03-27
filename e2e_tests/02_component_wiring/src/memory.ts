import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity()
export class Memory extends BaseEntity {
  @Describe() describe() { return `Memory: ${this.entries.length} entries`; }
  @State({ description: 'entries' }) private entries: string[] = [];

  @Tool({ description: 'Store' })
  async store(input: { text: string }) {
    this.entries.push(input.text);
    return { total: this.entries.length };
  }

  @Tool({ description: 'Get all' })
  async getAll() { return [...this.entries]; }

  @Tool({ description: 'Search' })
  async search(input: { query: string }) {
    return this.entries.filter(e => e.includes(input.query));
  }

  @Tool({ description: 'Count' })
  async count() { return this.entries.length; }

  @Tool({ description: 'Clear' })
  async clear() { this.entries = []; return { cleared: true }; }
}
