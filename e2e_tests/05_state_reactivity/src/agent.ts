import { Entity, BaseEntity, Describe, State, Tool, Hook, Init } from '@interactkit/sdk';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return `Agent: count=${this.count}, name=${this.name}`; }

  @State({ description: 'Counter' }) private count = 0;
  @State({ description: 'Name' }) private name = 'default';
  @State({ description: 'Nested' }) private data: { x: number; y: number } = { x: 0, y: 0 };

  @Hook(Init.Runner())
  async onInit() {
    console.log('[05] === Direct assignment ===');
    this.count = 42;
    console.log(`[05] count after assign: ${this.count}`);

    this.name = 'changed';
    console.log(`[05] name after assign: ${this.name}`);

    console.log('[05] === Object replacement ===');
    this.data = { x: 10, y: 20 };
    console.log(`[05] data: ${JSON.stringify(this.data)}`);

    console.log('[05] === Multiple rapid mutations ===');
    for (let i = 0; i < 100; i++) {
      this.count = i;
    }
    console.log(`[05] count after 100 mutations: ${this.count}`);

    console.log('[05] === Describe reflects state ===');
    const desc = this.describe();
    console.log(`[05] describe: ${desc}`);

    console.log('[05] === Tool mutates state ===');
    await this.setCount({ value: 999 });
    console.log(`[05] count after tool: ${this.count}`);

    await this.setName({ value: 'tool-set' });
    console.log(`[05] name after tool: ${this.name}`);

    console.log('[05] DONE');
    setTimeout(() => process.exit(0), 200);
  }

  @Tool({ description: 'Set count' })
  async setCount(input: { value: number }) { this.count = input.value; return this.count; }

  @Tool({ description: 'Set name' })
  async setName(input: { value: string }) { this.name = input.value; return this.name; }
}
