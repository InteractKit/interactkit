import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Memory extends BaseEntity {
  @Describe() describe() { return `Memory`; }
  @State({ description: 'entries' }) private entries: string[] = [];

  @Tool({ description: 'Store' })
  async store(input: { text: string }) { this.entries.push(input.text); return this.entries.length; }
}
