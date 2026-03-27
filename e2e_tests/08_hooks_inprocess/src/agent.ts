import { Entity, BaseEntity, Describe, State, Tool, Hook, Init, Component } from '@interactkit/sdk';

@Entity()
export class Counter extends BaseEntity {
  @Describe() describe() { return `Counter: ${this.value}`; }
  @State({ description: 'value' }) private value = 0;

  @Tool({ description: 'Increment' })
  async increment(input: { by: number }) {
    this.value += input.by;
    return this.value;
  }

  @Tool({ description: 'Get' })
  async get() { return this.value; }

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`[08] counter init: entityId=${input.entityId}`);
    this.value = 100;
    console.log(`[08] counter set to 100 in init`);
  }
}

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private counter!: Counter;

  @State({ description: 'init calls' })
  private initCalls = 0;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    this.initCalls++;
    console.log(`[08] agent init #${this.initCalls}: entityId=${input.entityId}, firstBoot=${input.firstBoot}`);

    // Verify child's Init already ran (child boots before parent hook)
    const counterVal = await this.counter.get();
    console.log(`[08] counter value after child init: ${counterVal}`);

    // Tool call after init — state from init should persist
    await this.counter.increment({ by: 5 });
    const after = await this.counter.get();
    console.log(`[08] counter after increment: ${after}`);

    // Verify init only called once
    console.log(`[08] agent initCalls: ${this.initCalls}`);

    console.log('[08] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
