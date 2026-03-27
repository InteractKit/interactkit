import type { PubSubAdapter } from './adapter.js';

/**
 * Zero-latency, in-memory adapter.
 *
 * - broadcast (publish/subscribe): all handlers get every message
 * - queue (enqueue/consume): round-robin across consumers
 */
export class InProcessBusAdapter implements PubSubAdapter {
  private channels = new Map<string, Set<(message: string) => void>>();
  private queues = new Map<string, string[]>();
  private consumers = new Map<string, Array<(message: string) => void>>();
  private consumerIndex = new Map<string, number>();

  // --- Broadcast ---

  async publish(channel: string, message: string): Promise<void> {
    const handlers = this.channels.get(channel);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      handler(message);
    }
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel)!.add(handler);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.channels.delete(channel);
  }

  // --- Queue (competing consumer) ---

  async enqueue(channel: string, message: string): Promise<void> {
    const consumers = this.consumers.get(channel);
    if (consumers && consumers.length > 0) {
      // Deliver directly to one consumer via round-robin
      const idx = (this.consumerIndex.get(channel) ?? 0) % consumers.length;
      this.consumerIndex.set(channel, idx + 1);
      consumers[idx](message);
    } else {
      // No consumers yet, buffer in queue
      if (!this.queues.has(channel)) this.queues.set(channel, []);
      this.queues.get(channel)!.push(message);
    }
  }

  async consume(channel: string, handler: (message: string) => void): Promise<void> {
    if (!this.consumers.has(channel)) this.consumers.set(channel, []);
    this.consumers.get(channel)!.push(handler);

    // Drain any buffered messages
    const queued = this.queues.get(channel);
    if (queued) {
      while (queued.length > 0) {
        handler(queued.shift()!);
      }
      this.queues.delete(channel);
    }
  }

  async stopConsuming(channel: string): Promise<void> {
    this.consumers.delete(channel);
    this.consumerIndex.delete(channel);
  }
}
