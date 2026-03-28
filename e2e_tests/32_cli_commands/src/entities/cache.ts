import { Entity, BaseEntity, Hook, Init, State, Tool, Describe } from '@interactkit/sdk';

@Entity({})
export class Cache extends BaseEntity {
  @Describe()
  describe() {
    return 'Cache entity.';
  }

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`[${this.id}] Cache initialized`);
  }
}
