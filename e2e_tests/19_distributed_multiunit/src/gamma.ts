import { Entity, BaseEntity, Describe, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Gamma extends BaseEntity {
  @Describe() describe() { return 'Gamma'; }

  @Tool({ description: 'Process' })
  async process(input: { data: string }) {
    return `gamma:${input.data}`;
  }
}
