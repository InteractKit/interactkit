import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity({ detached: true })
export class Worker extends BaseEntity {
  @Describe() describe() { return `Worker: ${this.processed}`; }
  @State({ description: 'processed' }) private processed = 0;

  @Tool({ description: 'Process' })
  async process(input: { data: string }) {
    this.processed++;
    // Simulate work
    await new Promise(r => setTimeout(r, 5));
    return { worker: this.id, data: input.data.toUpperCase(), n: this.processed };
  }

  @Tool({ description: 'Stats' })
  async stats() { return { processed: this.processed }; }
}
