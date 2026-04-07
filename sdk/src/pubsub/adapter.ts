type MessageHandler = (message: unknown) => void;

/**
 * Abstract PubSub adapter — the unified interface for all pubsub transports.
 */
export abstract class PubSubAdapter {
  abstract publish(channel: string, message: unknown): Promise<void>;
  abstract subscribe(channel: string, handler: MessageHandler): Promise<void>;
  abstract unsubscribe(channel: string): Promise<void>;
  abstract enqueue(channel: string, message: unknown): Promise<void>;
  abstract consume(channel: string, handler: MessageHandler): Promise<void>;
  abstract stopConsuming(channel: string): Promise<void>;
}

/**
 * Base for in-process adapters. Passes values directly by reference.
 */
export abstract class LocalPubSubAdapter extends PubSubAdapter {}

/**
 * Base for cross-process adapters (Redis, NATS, etc.).
 *
 * Handles JSON serialization automatically. Subclasses implement
 * raw string transport methods (publishRaw, subscribeRaw, etc.).
 *
 * v4: No proxy system — all values must be JSON-serializable.
 * The runtime only sends serializable tool inputs/outputs through the bus.
 */
export abstract class RemotePubSubAdapter extends PubSubAdapter {

  async publish(channel: string, message: unknown): Promise<void> {
    await this.publishRaw(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    await this.subscribeRaw(channel, (raw) => {
      handler(JSON.parse(raw));
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.unsubscribeRaw(channel);
  }

  async enqueue(channel: string, message: unknown): Promise<void> {
    await this.enqueueRaw(channel, JSON.stringify(message));
  }

  async consume(channel: string, handler: MessageHandler): Promise<void> {
    await this.consumeRaw(channel, (raw) => {
      handler(JSON.parse(raw));
    });
  }

  async stopConsuming(channel: string): Promise<void> {
    await this.stopConsumingRaw(channel);
  }

  // ─── Abstract: raw string transport (subclasses implement) ──

  protected abstract publishRaw(channel: string, message: string): Promise<void>;
  protected abstract subscribeRaw(channel: string, handler: (message: string) => void): Promise<void>;
  protected abstract unsubscribeRaw(channel: string): Promise<void>;
  protected abstract enqueueRaw(channel: string, message: string): Promise<void>;
  protected abstract consumeRaw(channel: string, handler: (message: string) => void): Promise<void>;
  protected abstract stopConsumingRaw(channel: string): Promise<void>;
}
