import { randomUUID } from "node:crypto";
import type { PubSubAdapter } from "../pubsub/adapter.js";
import type { ObserverAdapter } from "./adapter.js";
import type { EventEnvelope } from "../events/types.js";
import type { EntityTree } from "../entity/wrappers/types.js";
import { OBSERVER_CHANNELS } from "./bridge.js";

/**
 * Base observer with built-in event emitter.
 * Subclasses implement event() and error() for logging,
 * and can call this.emit() to send events back to subscribers.
 *
 * When connected to pubsub via connect(), control plane methods
 * (setState, getState, callMethod) send requests over pubsub
 * to the runtime process which handles them.
 */
export abstract class BaseObserver implements ObserverAdapter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private pubsub: PubSubAdapter | null = null;

  abstract event(envelope: EventEnvelope): void;
  abstract error(envelope: EventEnvelope, error: Error): void;

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  protected emit(event: string, ...args: unknown[]): void {
    for (const h of this.listeners.get(event) ?? []) h(...args);
  }

  // ─── PubSub connection ────────────────────────────────

  /**
   * Connect this observer to pubsub for control plane communication.
   * Called by the generated _observer.ts process.
   */
  async connect(pubsub: PubSubAdapter): Promise<void> {
    this.pubsub = pubsub;

    // Subscribe to events/errors from the runtime process
    await pubsub.subscribe(OBSERVER_CHANNELS.event, (msg: unknown) => {
      this.event(msg as EventEnvelope);
    });

    await pubsub.subscribe(OBSERVER_CHANNELS.error, (msg: unknown) => {
      const { envelope, error } = msg as {
        envelope: EventEnvelope;
        error: { message: string; stack?: string };
      };
      const err = new Error(error.message);
      err.stack = error.stack;
      this.error(envelope, err);
    });
  }

  // ─── Control plane ────────────────────────────────────

  setState(entityId: string, field: string, value: unknown): void {
    if (!this.pubsub)
      throw new Error("Observer not connected — call connect(pubsub) first");
    this.pubsub
      .publish(OBSERVER_CHANNELS.stateSet, { entityId, field, value })
      .catch(() => {});
  }

  getState(entityId: string, field: string): Promise<unknown> {
    if (!this.pubsub)
      return Promise.reject(new Error("Observer not connected"));
    const replyChannel = `__observer:reply:${randomUUID().slice(0, 8)}`;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pubsub!.unsubscribe(replyChannel);
        reject(new Error(`Observer getState timeout: ${entityId}.${field}`));
      }, 10_000);

      this.pubsub!.subscribe(replyChannel, (msg: unknown) => {
        clearTimeout(timer);
        this.pubsub!.unsubscribe(replyChannel);
        const { value, error } = msg as { value?: unknown; error?: string };
        if (error) reject(new Error(error));
        else resolve(value);
      }).then(() => {
        this.pubsub!.publish(OBSERVER_CHANNELS.stateGet, {
          entityId,
          field,
          replyChannel,
        });
      });
    });
  }

  callMethod(
    entityId: string,
    method: string,
    payload?: unknown,
  ): Promise<unknown> {
    if (!this.pubsub)
      return Promise.reject(new Error("Observer not connected"));
    const replyChannel = `__observer:reply:${randomUUID().slice(0, 8)}`;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pubsub!.unsubscribe(replyChannel);
        reject(new Error(`Observer callMethod timeout: ${entityId}.${method}`));
      }, 30_000);

      this.pubsub!.subscribe(replyChannel, (msg: unknown) => {
        clearTimeout(timer);
        this.pubsub!.unsubscribe(replyChannel);
        const { value, error } = msg as { value?: unknown; error?: string };
        if (error) reject(new Error(error));
        else resolve(value);
      }).then(() => {
        this.pubsub!.publish(OBSERVER_CHANNELS.methodCall, {
          entityId,
          method,
          payload,
          replyChannel,
        });
      });
    });
  }

  getEntityTree(): Promise<EntityTree> {
    if (!this.pubsub)
      return Promise.reject(new Error("Observer not connected"));
    const replyChannel = `__observer:reply:${randomUUID().slice(0, 8)}`;
    return new Promise<EntityTree>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pubsub!.unsubscribe(replyChannel);
        reject(new Error("Observer getEntityTree timeout"));
      }, 10_000);

      this.pubsub!.subscribe(replyChannel, (msg: unknown) => {
        clearTimeout(timer);
        this.pubsub!.unsubscribe(replyChannel);
        const { value } = msg as { value: EntityTree };
        resolve(value);
      }).then(() => {
        this.pubsub!.publish(OBSERVER_CHANNELS.entityTree, { replyChannel });
      });
    });
  }
}
