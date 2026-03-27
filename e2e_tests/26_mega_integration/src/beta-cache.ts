import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity()
export class BetaCache extends BaseEntity {
  @Describe() describe() { return `BetaCache`; }
  @State({ description: 'store' }) private store: Record<string, string> = {};

  @Tool({ description: 'Get' })
  async get(input: { key: string }) {
    return { hit: !!this.store[input.key], value: this.store[input.key] ?? null };
  }

  @Tool({ description: 'Put' })
  async put(input: { key: string; value: string }) { this.store[input.key] = input.value; }
}
