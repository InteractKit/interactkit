import type { PubSubAdapter } from '../../pubsub/adapter.js';

export interface EntityStream<T> {
  start(): void;
  data(payload: T): void;
  end(): void;
  emit(payload: T): void;
  on(event: 'start' | 'data' | 'end', handler: (...args: unknown[]) => void): void;
}

type StreamEvent = 'start' | 'data' | 'end';

/**
 * In-process stream. Used when child and parent are co-located.
 */
export class EntityStreamImpl<T> implements EntityStream<T> {
  private handlers = new Map<StreamEvent, Array<(...args: unknown[]) => void>>();
  private started = false;
  private ended = false;

  start(): void {
    if (this.started && !this.ended) throw new Error('Stream already started');
    this.started = true;
    this.ended = false;
    this.invoke('start');
  }

  data(payload: T): void {
    if (!this.started) throw new Error('Stream not started');
    if (this.ended) throw new Error('Stream already ended');
    this.invoke('data', payload);
  }

  end(): void {
    if (this.ended) throw new Error('Stream already ended');
    this.ended = true;
    this.invoke('end');
  }

  emit(payload: T): void {
    this.started = false;
    this.ended = false;
    this.start();
    this.data(payload);
    this.end();
  }

  on(event: StreamEvent, handler: (...args: unknown[]) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  private invoke(event: StreamEvent, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

/**
 * Distributed stream backed by pubsub. Used when child and parent
 * are in different processes.
 *
 * The child entity gets this stream — emit/start/data/end publish
 * to a Redis channel. The parent subscribes to that channel via
 * DistributedStreamSubscriber.
 *
 * Channel: stream:{entityType}.{streamName}
 */
export class DistributedEntityStream<T> implements EntityStream<T> {
  private localHandlers = new Map<StreamEvent, Array<(...args: unknown[]) => void>>();

  constructor(
    private channel: string,
    private pubsub: PubSubAdapter,
  ) {}

  start(): void {
    this.pubsub.publish(this.channel, JSON.stringify({ event: 'start' }));
    this.invokeLocal('start');
  }

  data(payload: T): void {
    this.pubsub.publish(this.channel, JSON.stringify({ event: 'data', payload }));
    this.invokeLocal('data', payload);
  }

  end(): void {
    this.pubsub.publish(this.channel, JSON.stringify({ event: 'end' }));
    this.invokeLocal('end');
  }

  emit(payload: T): void {
    this.start();
    this.data(payload);
    this.end();
  }

  on(event: StreamEvent, handler: (...args: unknown[]) => void): void {
    if (!this.localHandlers.has(event)) this.localHandlers.set(event, []);
    this.localHandlers.get(event)!.push(handler);
  }

  private invokeLocal(event: StreamEvent, ...args: unknown[]): void {
    for (const handler of this.localHandlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

/**
 * Subscriber side of a distributed stream. The parent entity gets this
 * on the component proxy. It subscribes to the Redis channel and invokes
 * local handlers when events arrive.
 */
export class DistributedStreamSubscriber<T> implements EntityStream<T> {
  private handlers = new Map<StreamEvent, Array<(...args: unknown[]) => void>>();
  private subscribed = false;

  constructor(
    private channel: string,
    private pubsub: PubSubAdapter,
  ) {}

  // Subscriber should not emit — these are no-ops
  start(): void {}
  data(_payload: T): void {}
  end(): void {}
  emit(_payload: T): void {}

  on(event: StreamEvent, handler: (...args: unknown[]) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);

    // Subscribe to channel on first handler registration
    if (!this.subscribed) {
      this.subscribed = true;
      this.pubsub.subscribe(this.channel, (message: unknown) => {
        const msg = JSON.parse(message as string) as { event: StreamEvent; payload?: unknown };
        const handlers = this.handlers.get(msg.event) ?? [];
        for (const h of handlers) {
          h(...(msg.payload !== undefined ? [msg.payload] : []));
        }
      });
    }
  }
}
