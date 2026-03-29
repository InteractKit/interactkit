import { Entity, BaseEntity, Hook, Init, State, Tool } from '@interactkit/sdk';

@Entity({})
export class Cache extends BaseEntity {
  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`[${this.id}] Cache initialized`);
  }
}
