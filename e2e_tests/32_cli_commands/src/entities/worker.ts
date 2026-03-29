import { Cache } from './cache.js';
import { Entity, BaseEntity, Hook, Init, State, Tool, Ref, type Remote } from '@interactkit/sdk';

@Entity({ detached: true })
export class Worker extends BaseEntity {
  @Ref() private cache!: Remote<Cache>;
  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`[${this.id}] Worker initialized`);
  }
}
