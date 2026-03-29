import { Entity, BaseEntity, Describe, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Worker extends BaseEntity {
  @Describe() describe() { return 'Worker'; }

  @Tool({ description: 'Echo input' })
  async echo(input: { msg: string }) {
    return `${input.msg}:echoed`;
  }
}
