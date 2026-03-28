import { Entity, BaseEntity, Describe, Component, Tool, type Remote } from '@interactkit/sdk';
import { Team } from './team.js';

@Entity()
export class Manager extends BaseEntity {
  @Describe() describe() { return 'Manager'; }
  @Component() private team!: Remote<Team>;

  @Tool({ description: 'Delegate' })
  async delegate(input: { task: string }) {
    return this.team.assign({ task: input.task });
  }

  @Tool({ description: 'Audit' })
  async audit() { return this.team.getDeepLogs(); }
}
