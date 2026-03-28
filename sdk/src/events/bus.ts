import { randomUUID } from 'node:crypto';
import type { PubSubAdapter } from '../pubsub/adapter.js';
import type { LogAdapter } from '../logger/adapter.js';
import type { EventEnvelope } from './types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Request/response event bus over a PubSubAdapter.
 *
 * Envelope structure is always serializable. Payload may not be —
 * if payload is non-serializable, it's sent separately through
 * the PubSubAdapter's proxy system and reunited on the other side.
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

    // Subscribe for reply on two channels: error (always serializable) and payload (may be proxied)
    await this.pubsub.subscribe(`${replyChannel}:error`, (message) => {
      const pending = this.pendingRequests.get(correlationId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(correlationId);
      this.pubsub.unsubscribe(`${replyChannel}:error`);
      this.pubsub.unsubscribe(`${replyChannel}:payload`);
      const e = message as { message: string; stack?: string };
      const err = new Error(e.message);
      err.stack = e.stack;
      pending.reject(err);
    });

    await this.pubsub.subscribe(`${replyChannel}:payload`, (message) => {
      const pending = this.pendingRequests.get(correlationId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(correlationId);
      this.pubsub.unsubscribe(`${replyChannel}:error`);
      this.pubsub.unsubscribe(`${replyChannel}:payload`);
      pending.resolve(message); // message is the payload directly — proxied if non-serializable
    });

    // Send request — envelope is serializable (payload is data, not functions)
    this.logger?.event(envelope);
    await this.pubsub.enqueue(`entity:${envelope.target}`, envelope);

    return promise;
  }

  async listen(
    entityId: string,
    handler: (envelope: EventEnvelope) => Promise<unknown>,
  ): Promise<void> {
    await this.pubsub.consume(`entity:${entityId}`, async (message) => {
      const envelope = message as EventEnvelope;
      this.logger?.event(envelope);

      let payload: unknown;
      let error: { message: string; stack?: string } | undefined;

      try {
        payload = await handler(envelope);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        error = { message: e.message, stack: e.stack };
        this.logger?.error(envelope, e);
      }

      if (envelope.correlationId) {
        const replyBase = `reply:${envelope.correlationId}`;
        if (error) {
          await this.pubsub.publish(`${replyBase}:error`, error);
        } else {
          // Payload sent directly — PubSubAdapter proxies if non-serializable
          await this.pubsub.publish(`${replyBase}:payload`, payload);
        }
      }
    });
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    this.logger?.event(envelope);
    await this.pubsub.enqueue(`entity:${envelope.target}`, envelope);
  }

  async destroy(): Promise<void> {
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('EventBus destroyed'));
    }
    this.pendingRequests.clear();
  }
}
