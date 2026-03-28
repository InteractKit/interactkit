import { Entity, BaseEntity, Describe, Component, Hook, Init, type Remote } from '@interactkit/sdk';
import { Worker } from './worker.js';

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() { return 'Agent'; }
  @Component() private worker!: Remote<Worker>;

  @Hook(Init.Runner())
  async onInit() {
    // Wait for worker's HTTP hook to start listening
    await new Promise(r => setTimeout(r, 1000));

    // === 1. Send HTTP request to the worker's hook ===
    const res1 = await fetch('http://localhost:4555/hook', {
      method: 'POST',
      body: JSON.stringify({ msg: 'hello' }),
    });
    const data1 = await res1.json() as { ok: boolean; count: number };
    console.log(`  ok http response: ${JSON.stringify(data1)}`);

    // === 2. Send another request ===
    const res2 = await fetch('http://localhost:4555/hook', {
      method: 'POST',
      body: JSON.stringify({ msg: 'world' }),
    });
    const data2 = await res2.json() as { ok: boolean; count: number };
    console.log(`  ok second response count: ${data2.count}`);

    // === 3. Verify via tool call that requests were stored ===
    await new Promise(r => setTimeout(r, 300));
    const requests = await this.worker.getRequests();
    console.log(`  ok stored requests: ${requests.length}`);
    console.log(`  ok first request: ${requests[0]}`);

    console.log('  ok DONE');
  }
}
