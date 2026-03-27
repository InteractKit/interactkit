import { Entity, BaseEntity, Describe, State, Hook, Init } from '@interactkit/sdk';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return `Agent: ${this.items.length} items`; }

  @State({ description: 'Items' }) private items: string[] = [];
  @State({ description: 'Numbers' }) private nums: number[] = [];

  @Hook(Init.Runner())
  async onInit() {
    console.log('[06] === push ===');
    this.items.push('a', 'b', 'c');
    console.log(`[06] after push 3: ${this.items.length}`);

    for (let i = 0; i < 50; i++) this.items.push(`item-${i}`);
    console.log(`[06] after push 50 more: ${this.items.length}`);

    console.log('[06] === pop ===');
    const popped = this.items.pop();
    console.log(`[06] popped: ${popped}, length: ${this.items.length}`);

    console.log('[06] === unshift/shift ===');
    this.items.unshift('first');
    console.log(`[06] after unshift: [0]=${this.items[0]}, length=${this.items.length}`);
    const shifted = this.items.shift();
    console.log(`[06] shifted: ${shifted}, length: ${this.items.length}`);

    console.log('[06] === splice ===');
    this.items.splice(0, 5);
    console.log(`[06] after splice(0,5): length=${this.items.length}`);

    console.log('[06] === sort/reverse ===');
    this.nums = [5, 3, 8, 1, 9, 2];
    this.nums.sort((a, b) => a - b);
    console.log(`[06] sorted: ${JSON.stringify(this.nums)}`);
    this.nums.reverse();
    console.log(`[06] reversed: ${JSON.stringify(this.nums)}`);

    console.log('[06] === fill ===');
    this.nums.fill(0);
    console.log(`[06] filled: ${JSON.stringify(this.nums)}`);

    console.log('[06] === index assignment ===');
    this.nums[2] = 42;
    console.log(`[06] nums[2]: ${this.nums[2]}`);

    console.log('[06] === reassign ===');
    this.items = ['fresh', 'start'];
    console.log(`[06] after reassign: ${JSON.stringify(this.items)}`);

    console.log('[06] DONE');
    setTimeout(() => process.exit(0), 200);
  }
}
