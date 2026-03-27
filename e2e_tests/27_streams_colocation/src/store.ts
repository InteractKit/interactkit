import { Entity, BaseEntity, Describe, State, Tool, RedisPubSubAdapter } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
export class Store extends BaseEntity {
  @Describe() describe() { return `Store: ${this.events.length}`; }
  @State({ description: 'events' }) private events: string[] = [];

  @Tool({ description: 'Record event' })
  async record(input: { event: string }) {
    this.events.push(input.event);
    return this.events.length;
  }

  @Tool({ description: 'Get events' })
  async getEvents() { return [...this.events]; }

  @Tool({ description: 'Count' })
  async count() { return this.events.length; }
}
