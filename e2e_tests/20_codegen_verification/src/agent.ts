import { Entity, BaseEntity, Describe, Component, Hook, Init, Tick, type Remote } from '@interactkit/sdk';
import { Memory } from './memory.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private memory!: Remote<Memory>;

  @Hook(Init.Runner())
  async onInit() {}

  @Hook(Tick.Runner({ intervalMs: 1000 }))
  async onTick() {}
}
