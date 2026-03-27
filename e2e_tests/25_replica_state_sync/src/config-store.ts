import { Entity, BaseEntity, Describe, State, Tool, RedisPubSubAdapter } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
export class ConfigStore extends BaseEntity {
  @Describe() describe() { return `Config: ${this.settings.length} settings`; }

  @State({ description: 'settings' })
  private settings: Array<{ key: string; value: string }> = [];

  @State({ description: 'version' })
  private version = 0;

  @Tool({ description: 'Set config value' })
  async set(input: { key: string; value: string }) {
    this.settings = this.settings.filter(s => s.key !== input.key);
    this.settings.push({ key: input.key, value: input.value });
    this.version++;
    return { version: this.version, pid: process.pid };
  }

  @Tool({ description: 'Get config value' })
  async get(input: { key: string }) {
    const found = this.settings.find(s => s.key === input.key);
    return { value: found?.value ?? null, version: this.version, pid: process.pid };
  }

  @Tool({ description: 'Get all' })
  async getAll() {
    return { settings: [...this.settings], version: this.version, pid: process.pid };
  }
}
