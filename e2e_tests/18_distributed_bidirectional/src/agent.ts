import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Ping } from './ping.js';
import { Pong } from './pong.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private ping!: Remote<Ping>;
  @Component() private pong!: Remote<Pong>;

  @Hook(Init.Runner())
  async onInit() {
    let exchanges = 0;
    for (let i = 0; i < 5; i++) {
      const p = await this.ping.ping({ n: i });
      const q = await this.pong.pong({ n: i });
      if (p === `ping-${i}` && q === `pong-${i}`) exchanges++;
    }
    console.log(`exchanges: ${exchanges}`);
    console.log('DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
