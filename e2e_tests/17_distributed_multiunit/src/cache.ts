import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Cache extends BaseEntity {
  @Describe() describe() { return `Cache: ${Object.keys(this.store).length} keys`; }
  @State({ description: 'store' }) private store: Record<string, string> = {};

  @Tool({ description: 'Put' })
  async put(input: { key: string; val: string }) { this.store[input.key] = input.val; return true; }

  @Tool({ description: 'Fetch' })
  async fetch(input: { key: string }) { return this.store[input.key] ?? null; }

  @Tool({ description: 'Size' })
  async size() { return Object.keys(this.store).length; }
}
