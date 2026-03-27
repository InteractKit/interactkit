import { Entity, BaseEntity, Describe, Tool } from '@interactkit/sdk';

@Entity()
export class Tools extends BaseEntity {
  @Describe() describe() { return 'Tools'; }

  @Tool({ description: 'Return string' }) async retString() { return 'hello'; }
  @Tool({ description: 'Return number' }) async retNumber() { return 42; }
  @Tool({ description: 'Return boolean' }) async retBoolean() { return true; }
  @Tool({ description: 'Return null' }) async retNull() { return null; }
  @Tool({ description: 'Return undefined' }) async retUndefined() { return undefined; }
  @Tool({ description: 'Return object' }) async retObject() { return { a: 1, b: { c: 2 } }; }
  @Tool({ description: 'Return array' }) async retArray() { return [1, 'two', { three: 3 }]; }
  @Tool({ description: 'Return empty' }) async retEmpty() { return {}; }
  @Tool({ description: 'Return large' })
  async retLarge() {
    return { items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` })) };
  }
}
