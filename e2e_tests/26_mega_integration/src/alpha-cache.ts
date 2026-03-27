import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity()
export class AlphaCache extends BaseEntity {
  @Describe() describe() { return `AlphaCache: ${this.hits}/${this.misses}`; }
  @State({ description: 'hits' }) private hits = 0;
  @State({ description: 'misses' }) private misses = 0;
  @State({ description: 'store' }) private store: Record<string, string> = {};

  @Tool({ description: 'Get or miss' })
  async get(input: { key: string }) {
    if (this.store[input.key]) { this.hits++; return { hit: true, value: this.store[input.key] }; }
    this.misses++;
    return { hit: false, value: null };
  }

  @Tool({ description: 'Put' })
  async put(input: { key: string; value: string }) { this.store[input.key] = input.value; }

  @Tool({ description: 'Stats' })
  async stats() { return { hits: this.hits, misses: this.misses }; }
}
