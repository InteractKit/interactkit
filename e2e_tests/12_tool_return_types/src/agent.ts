import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Tools } from './tools.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private tools!: Remote<Tools>;

  @Hook(Init.Runner())
  async onInit() {
    const s = await this.tools.retString();
    console.log(`[12] string: "${s}" type=${typeof s}`);

    const n = await this.tools.retNumber();
    console.log(`[12] number: ${n} type=${typeof n}`);

    const b = await this.tools.retBoolean();
    console.log(`[12] boolean: ${b} type=${typeof b}`);

    const nul = await this.tools.retNull();
    console.log(`[12] null: ${nul} isNull=${nul === null}`);

    const und = await this.tools.retUndefined();
    console.log(`[12] undefined: ${und} isUndef=${und === undefined || und === null}`);

    const obj = await this.tools.retObject();
    console.log(`[12] object: ${JSON.stringify(obj)}`);

    const arr = await this.tools.retArray();
    console.log(`[12] array: ${JSON.stringify(arr)} isArr=${Array.isArray(arr)}`);

    const empty = await this.tools.retEmpty();
    console.log(`[12] empty: ${JSON.stringify(empty)}`);

    const large = await this.tools.retLarge();
    console.log(`[12] large: ${large.items.length} items, last=${large.items[99].name}`);

    console.log('[12] DONE');
    setTimeout(() => process.exit(0), 100);
  }
}
