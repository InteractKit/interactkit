import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Calculator } from './calculator.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private calculator!: Remote<Calculator>;

  @Hook(Init.Runner())
  async onInit() {
    await Promise.all(
      Array.from({ length: 500 }, () => this.calculator.add())
    );
    const count = await this.calculator.get();
    console.log(`count: ${count}`);
    console.log('DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
