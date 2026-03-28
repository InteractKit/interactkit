import { Entity, BaseEntity, Hook, Init, State, Tool, Describe } from '@interactkit/sdk';

@Entity({})
export class Memory extends BaseEntity {
  @Describe()
  describe() {
    return 'Memory entity.';
  }

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`[${this.id}] Memory initialized`);
  }
}
