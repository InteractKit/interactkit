import { Entity, BaseEntity, Hook, Init, State, Tool, Describe, Component, type Remote } from '@interactkit/sdk';
import { Worker } from './worker.js';
import { Cache } from './cache.js';

@Entity({})
export class MyAgent extends BaseEntity {
  @Component() private cache!: Remote<Cache>;
  @Component() private worker!: Remote<Worker>;
  @Component() private helper!: Remote<Helper>;
  @Describe()
  describe() {
    return 'MyAgent entity.';
  }

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`[${this.id}] MyAgent initialized`);
  }
}
