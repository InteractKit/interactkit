import { LocalPubSubAdapter } from "./adapter.js";

/**
 * Zero-latency, in-memory adapter. Passes values by reference —
 * no serialization, no proxy. Functions, class instances, etc. work natively.
 *
 * - broadcast (publish/subscribe): all handlers get every message
 * - queue (enqueue/consume): round-robin across consumers
 */
export class InProcessBusAdapter extends LocalPubSubAdapter {
  private channels = new Map<string, Set<(message: unknown) => void>>();
  private queues = new Map<string, unknown[]>();
  private consumers = new Map<string, Array<(message: unknown) => void>>();
  private consumerIndex = new Map<string, number>();

  // --- Broadcast ---

  async publish(channel: string, message: unknown): Promise<void> {
    const handlers = this.channels.get(channel);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      handler(message);
    }
  }

  async subscribe(
    channel: string,
    handler: (message: unknown) => void,
  ): Promise<void> {
    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel)!.add(handler);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.channels.delete(channel);
  }

  // --- Queue (competing consumer) ---

  async enqueue(channel: string, message: unknown): Promise<void> {
    const consumers = this.consumers.get(channel);
    if (consumers && consumers.length > 0) {
      const idx = (this.consumerIndex.get(channel) ?? 0) % consumers.length;
      this.consumerIndex.set(channel, idx + 1);
      consumers[idx](message);
    } else {
      if (!this.queues.has(channel)) this.queues.set(channel, []);
      this.queues.get(channel)!.push(message);
    }
  }

  async consume(
    channel: string,
    handler: (message: unknown) => void,
  ): Promise<void> {
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
