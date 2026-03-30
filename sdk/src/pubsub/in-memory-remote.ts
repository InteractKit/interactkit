import { RemotePubSubAdapter } from './adapter.js';

/**
 * In-memory implementation of RemotePubSubAdapter.
 * Drop-in replacement for RedisPubSubAdapter during local dev.
 * No external dependencies — everything stays in-process.
 */
export class InMemoryRemotePubSubAdapter extends RemotePubSubAdapter {
  private handlers = new Map<string, (message: string) => void>();
  private queues = new Map<string, string[]>();
  private consumers = new Map<string, (message: string) => void>();

  protected async publishRaw(channel: string, message: string): Promise<void> {
    const handler = this.handlers.get(channel);
    if (handler) handler(message);
  }

  protected async subscribeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    this.handlers.set(channel, handler);
  }

  protected async unsubscribeRaw(channel: string): Promise<void> {
    this.handlers.delete(channel);
  }

  protected async enqueueRaw(channel: string, message: string): Promise<void> {
    const consumer = this.consumers.get(channel);
    if (consumer) {
      consumer(message);
      return;
    }
    const queue = this.queues.get(channel) ?? [];
    queue.push(message);
    this.queues.set(channel, queue);
  }

  protected async consumeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    this.consumers.set(channel, handler);
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
