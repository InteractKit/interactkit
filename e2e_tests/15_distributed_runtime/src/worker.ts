import { Entity, BaseEntity, Describe, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Worker extends BaseEntity {
  @Describe() describe() { return 'Worker'; }

  @Tool({ description: 'Get ID' })
  async getId() {
    return this.id;
  }
}
