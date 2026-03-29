import { Entity, BaseEntity, Describe, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Ping extends BaseEntity {
  @Describe() describe() { return 'Ping'; }

  @Tool({ description: 'Ping' })
  async ping(input: { n: number }) {
    return `ping-${input.n}`;
  }
}
