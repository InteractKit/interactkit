import { RemotePubSubAdapter } from './adapter.js';

/**
 * In-memory implementation of RemotePubSubAdapter.
 * Drop-in replacement for RedisPubSubAdapter during local dev.
 * No external dependencies — everything stays in-process.
 */
export class InMemoryRemotePubSubAdapter extends RemotePubSubAdapter {
  private subscribers = new Map<string, Set<(message: string) => void>>();
  private queues = new Map<string, string[]>();
  private consumers = new Map<string, Set<(message: string) => void>>();
  private roundRobin = new Map<string, number>();

  protected async publishRaw(channel: string, message: string): Promise<void> {
    const handlers = this.subscribers.get(channel);
    if (handlers) for (const h of handlers) h(message);
  }

  protected async subscribeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    const set = this.subscribers.get(channel) ?? new Set();
    set.add(handler);
    this.subscribers.set(channel, set);
  }

  protected async unsubscribeRaw(channel: string): Promise<void> {
    this.subscribers.delete(channel);
  }

  protected async enqueueRaw(channel: string, message: string): Promise<void> {
    const cons = this.consumers.get(channel);
    if (cons && cons.size > 0) {
      const arr = [...cons];
      const idx = (this.roundRobin.get(channel) ?? 0) % arr.length;
      this.roundRobin.set(channel, idx + 1);
      arr[idx](message);
      return;
    }
    const queue = this.queues.get(channel) ?? [];
    queue.push(message);
    this.queues.set(channel, queue);
  }

  protected async consumeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    const set = this.consumers.get(channel) ?? new Set();
    set.add(handler);
    this.consumers.set(channel, set);
    // Drain any queued messages
    const queue = this.queues.get(channel);
    if (queue) {
      this.queues.delete(channel);
      for (const msg of queue) handler(msg);
    }
  }

  protected async stopConsumingRaw(channel: string): Promise<void> {
    this.consumers.delete(channel);
  }
}
