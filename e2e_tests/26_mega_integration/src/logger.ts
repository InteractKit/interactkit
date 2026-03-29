import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Logger extends BaseEntity {
  @Describe() describe() { return `Logger: ${this.entries.length} entries`; }
  @State({ description: 'entries' }) private entries: string[] = [];

  @Tool({ description: 'Log' })
  async log(input: { msg: string }) {
    this.entries.push(`[${new Date().toISOString().slice(11,19)}] ${input.msg}`);
    return this.entries.length;
  }

  @Tool({ description: 'Get logs' })
  async getLogs() { return [...this.entries]; }

  @Tool({ description: 'Count' })
  async count() { return this.entries.length; }
}
