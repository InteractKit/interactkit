import { Entity, BaseEntity, Describe, State, Tool, RedisPubSubAdapter } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
export class Memory extends BaseEntity {
  @Describe() describe() { return `Memory: ${this.entries.length}`; }
  @State({ description: 'entries' }) private entries: string[] = [];

  @Tool({ description: 'Store' })
  async store(input: { text: string }) { this.entries.push(input.text); return this.entries.length; }

  @Tool({ description: 'Get all' })
  async getAll() { return [...this.entries]; }

  @Tool({ description: 'Count' })
  async count() { return this.entries.length; }

  @Tool({ description: 'Search' })
  async search(input: { query: string }) {
    return this.entries.filter(e => e.includes(input.query));
  }
}
