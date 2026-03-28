import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity()
export class Cache extends BaseEntity {
  @Describe() describe() { return `Cache: ${Object.keys(this.store).length} entries`; }
  @State({ description: 'cache store' }) private store: Record<string, string> = {};

  @Tool({ description: 'Get a cached value' })
  async get(input: { key: string }) {
    const val = this.store[input.key];
    return { hit: val !== undefined, value: val ?? null };
  }

  @Tool({ description: 'Put a value in cache' })
  async put(input: { key: string; value: string }) {
    this.store[input.key] = input.value;
    return { stored: true };
  }

  @Tool({ description: 'Get cache size' })
  async size() {
    return { size: Object.keys(this.store).length };
  }
}
