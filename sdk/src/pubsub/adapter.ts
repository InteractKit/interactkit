export interface PubSubAdapter {
  /** Broadcast a message to ALL subscribers on a channel. */
  publish(channel: string, message: string): Promise<void>;
  /** Subscribe to broadcast messages on a channel. All subscribers receive every message. */
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  /** Unsubscribe from broadcast messages on a channel. */
  unsubscribe(channel: string): Promise<void>;

  /** Enqueue a message for ONE consumer on a channel. Messages are durable until consumed. */
  enqueue(channel: string, message: string): Promise<void>;
  /** Start consuming queued messages. Only one consumer across all replicas processes each message. */
  consume(channel: string, handler: (message: string) => void): Promise<void>;
  /** Stop consuming queued messages on a channel. */
  stopConsuming(channel: string): Promise<void>;
}
