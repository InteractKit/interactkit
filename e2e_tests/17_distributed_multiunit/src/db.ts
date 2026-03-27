import { Entity, BaseEntity, Describe, State, Tool, RedisPubSubAdapter } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
export class Db extends BaseEntity {
  @Describe() describe() { return `Db: ${this.records.length} records`; }
  @State({ description: 'records' }) private records: Array<{ key: string; val: string }> = [];

  @Tool({ description: 'Set' })
  async set(input: { key: string; val: string }) {
    this.records = this.records.filter(r => r.key !== input.key);
    this.records.push({ key: input.key, val: input.val });
    return this.records.length;
  }

  @Tool({ description: 'Get' })
  async get(input: { key: string }) {
    return this.records.find(r => r.key === input.key)?.val ?? null;
  }

  @Tool({ description: 'Keys' })
  async keys() { return this.records.map(r => r.key); }
}
