import type { PubSubAdapter } from './adapter.js';

/**
 * Zero-latency, in-memory pub/sub adapter.
 * Used as default when no pubsub is configured, or explicitly for fast paths.
 */
export class InProcessBusAdapter implements PubSubAdapter {
  private channels = new Map<string, Set<(message: string) => void>>();

  async publish(channel: string, message: string): Promise<void> {
    const handlers = this.channels.get(channel);
    if (!handlers) return;
    // Snapshot to avoid mutation during iteration
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
}
