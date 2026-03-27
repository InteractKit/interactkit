import { randomUUID } from 'node:crypto';
import type { PubSubAdapter } from '../pubsub/adapter.js';
import type { LogAdapter } from '../logger/adapter.js';
import type { EventEnvelope } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Request/response event bus over a PubSubAdapter.
 *
 * Entity channels use enqueue/consume (competing consumer — only one replica
 * processes each request). Reply channels use publish/subscribe (broadcast —
 * the caller always gets the response).
 */
export class EventBus {
  private pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(
    private pubsub: PubSubAdapter,
    private logger?: LogAdapter,
    private timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  /**
   * Send a request envelope and wait for a correlated response.
   */
  async request(envelope: EventEnvelope): Promise<unknown> {
    const correlationId = randomUUID();
    envelope.correlationId = correlationId;

    const replyChannel = `reply:${correlationId}`;

    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        this.pubsub.unsubscribe(replyChannel);
        reject(new Error(`Timeout: ${envelope.type} on ${envelope.target} (${this.timeoutMs}ms)`));
      }, this.timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timer });
    });

    // Reply channels use broadcast — the caller always gets the response
    await this.pubsub.subscribe(replyChannel, (message) => {
      const response: EventEnvelope = JSON.parse(message);
      const pending = this.pendingRequests.get(correlationId);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pendingRequests.delete(correlationId);
      this.pubsub.unsubscribe(replyChannel);

      if (response.error) {
        const err = new Error(response.error.message);
        err.stack = response.error.stack;
        pending.reject(err);
      } else {
        pending.resolve(response.payload);
      }
    });

    // Entity channels use queue — one replica picks up the request
    this.logger?.event(envelope);
    await this.pubsub.enqueue(`entity:${envelope.target}`, JSON.stringify(envelope));

    return promise;
  }

  /**
   * Listen for incoming events on an entity's channel.
   * Uses consume (competing consumer) so only one replica processes each event.
   */
  async listen(
    entityId: string,
    handler: (envelope: EventEnvelope) => Promise<unknown>,
  ): Promise<void> {
    await this.pubsub.consume(`entity:${entityId}`, async (message) => {
      const envelope: EventEnvelope = JSON.parse(message);
      this.logger?.event(envelope);

      const response: EventEnvelope = {
        id: randomUUID(),
        source: entityId,
        target: envelope.source,
        type: `${envelope.type}:response`,
        payload: undefined,
        timestamp: Date.now(),
        correlationId: envelope.correlationId,
      };

      try {
        response.payload = await handler(envelope);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        response.error = { message: error.message, stack: error.stack };
        this.logger?.error(envelope, error);
      }

      // Replies use broadcast — guaranteed to reach the caller
      if (envelope.correlationId) {
        await this.pubsub.publish(`reply:${envelope.correlationId}`, JSON.stringify(response));
      }
    });
  }

  /**
   * Fire-and-forget enqueue (no response expected).
   */
  async publish(envelope: EventEnvelope): Promise<void> {
    this.logger?.event(envelope);
    await this.pubsub.enqueue(`entity:${envelope.target}`, JSON.stringify(envelope));
  }

  /**
   * Tear down: reject all pending requests, clean up.
   */
  async destroy(): Promise<void> {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('EventBus destroyed'));
    }
    this.pendingRequests.clear();
  }
}
