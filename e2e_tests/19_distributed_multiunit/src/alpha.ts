import { Entity, BaseEntity, Describe, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Alpha extends BaseEntity {
  @Describe() describe() { return 'Alpha'; }

  @Tool({ description: 'Process' })
  async process(input: { data: string }) {
    return `alpha:${input.data}`;
  }
}
