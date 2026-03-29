import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Store } from './store.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private store!: Remote<Store>;

  @Hook(Init.Runner())
  async onInit() {
    for (let i = 0; i < 10; i++) {
      await this.store.write({ key: `k${i}`, value: `v${i}` });
    }
    console.log('written: 10');

    let readCount = 0;
    for (let i = 0; i < 10; i++) {
      const val = await this.store.read({ key: `k${i}` });
      if (val === `v${i}`) readCount++;
    }
    console.log(`read back: ${readCount}`);
    console.log('DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
