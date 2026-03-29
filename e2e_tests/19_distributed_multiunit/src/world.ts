import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Alpha } from './alpha.js';
import { Beta } from './beta.js';
import { Gamma } from './gamma.js';

@Entity()
export class World extends BaseEntity {
  @Describe() describe() { return 'World'; }
  @Component() private alpha!: Remote<Alpha>;
  @Component() private beta!: Remote<Beta>;
  @Component() private gamma!: Remote<Gamma>;

  @Hook(Init.Runner())
  async onInit() {
    const [a, b, g] = await Promise.all([
      this.alpha.process({ data: 'test' }),
      this.beta.process({ data: 'test' }),
      this.gamma.process({ data: 'test' }),
    ]);
    console.log(a);
    console.log(b);
    console.log(g);
    if (a && b && g) console.log('all 3 responded');
    console.log('DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
