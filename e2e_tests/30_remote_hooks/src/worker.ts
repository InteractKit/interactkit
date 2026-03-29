import { Entity, BaseEntity, Describe, State, Tool, Hook, Init, type Remote } from '@interactkit/sdk';
import { HttpRequest } from '@interactkit/http';

@Entity({ detached: true })
export class Worker extends BaseEntity {
  @Describe() describe() { return `Worker: ${this.requests.length} requests`; }
  @State({ description: 'received requests' }) private requests: string[] = [];

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log(`  worker booted: ${input.entityId}`);
  }

  @Hook(HttpRequest.Runner({ port: 4555, path: '/hook' }))
  async onRequest(input: Remote<HttpRequest.Input>) {
    const method = await input.method;
    const path = await input.path;
    const body = await input.body;
    this.requests.push(`${method}:${path}:${body}`);
    console.log(`  worker received: ${method} ${path}`);
    await input.respond(200, JSON.stringify({ ok: true, count: this.requests.length }));
  }

  @Tool({ description: 'Get received requests' })
  async getRequests() { return [...this.requests]; }
}
