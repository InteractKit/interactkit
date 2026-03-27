import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity()
export class Logger extends BaseEntity {
  @Describe() describe() { return `Logger: ${this.logs.length} logs`; }
  @State({ description: 'logs' }) private logs: string[] = [];

  @Tool({ description: 'Log' })
  async log(input: { msg: string }) {
    this.logs.push(input.msg);
    return { logged: true, total: this.logs.length };
  }

  @Tool({ description: 'Get logs' })
  async getLogs() { return [...this.logs]; }
}
