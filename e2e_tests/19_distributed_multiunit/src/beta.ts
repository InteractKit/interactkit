import { Entity, BaseEntity, Describe, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Beta extends BaseEntity {
  @Describe() describe() { return 'Beta'; }

  @Tool({ description: 'Process' })
  async process(input: { data: string }) {
    return `beta:${input.data}`;
  }
}
