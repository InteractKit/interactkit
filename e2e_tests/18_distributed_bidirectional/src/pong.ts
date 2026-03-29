import { Entity, BaseEntity, Describe, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Pong extends BaseEntity {
  @Describe() describe() { return 'Pong'; }

  @Tool({ description: 'Pong' })
  async pong(input: { n: number }) {
    return `pong-${input.n}`;
  }
}
