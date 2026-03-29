import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Store extends BaseEntity {
  @Describe() describe() { return 'Store'; }
  @State({ description: 'entries' }) private entries: Record<string, string> = {};

  @Tool({ description: 'Write entry' })
  async write(input: { key: string; value: string }) {
    this.entries[input.key] = input.value;
    return true;
  }

  @Tool({ description: 'Read entry' })
  async read(input: { key: string }) {
    return this.entries[input.key] ?? null;
  }
}
