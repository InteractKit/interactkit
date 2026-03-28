import { Cache } from './cache.js';
import { Entity, BaseEntity, Hook, Init, State, Tool, Describe, RedisPubSubAdapter, Ref, type Remote } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
export class Worker extends BaseEntity {
  @Ref() private cache!: Remote<Cache>;
  @Describe()
  describe() {
    return 'Worker entity.';
  }

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`[${this.id}] Worker initialized`);
  }
}
