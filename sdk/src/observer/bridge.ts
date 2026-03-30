import type { PubSubAdapter } from '../pubsub/adapter.js';
import type { ObserverAdapter } from './adapter.js';
import type { EventEnvelope } from '../events/types.js';
import type { StateWrapper } from '../entity/wrappers/state-wrapper.js';
import type { MethodWrapper } from '../entity/wrappers/method-wrapper.js';
import type { EntityTree } from '../entity/wrappers/types.js';

/** Well-known pubsub channels for observer <-> runtime communication. */
export const OBSERVER_CHANNELS = {
  event: '__observer:event',
  error: '__observer:error',
  stateSet: '__observer:state:set',
  stateGet: '__observer:state:get',
  methodCall: '__observer:method:call',
  entityTree: '__observer:entity:tree',
} as const;

/**
 * Sits in the entity process. Implements ObserverAdapter so wrappers
 * can call event()/error() as usual — but forwards everything over pubsub
 * to the real observer running in _observer.ts.
 *
 * Also consumes control plane channels (state:set, state:get, method:call)
 * and routes them to the appropriate wrappers.
 */
export class ObserverBridge implements ObserverAdapter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(private pubsub: PubSubAdapter) {}

  // ─── Forward to observer process ──────────────────────

  event(envelope: EventEnvelope): void {
    this.pubsub.publish(OBSERVER_CHANNELS.event, envelope).catch(() => {});
    this.emit('event', envelope);
  }

  error(envelope: EventEnvelope, error: Error): void {
    this.pubsub.publish(OBSERVER_CHANNELS.error, {
      envelope,
      error: { message: error.message, stack: error.stack },
    }).catch(() => {});
    this.emit('error', envelope, error);
  }

  // ─── Local event emitter (for in-process subscribers) ──

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const h of this.listeners.get(event) ?? []) h(...args);
  }

  // ─── Control plane (no-op on bridge side — observer process calls these) ──

  setState(_entityId: string, _field: string, _value: unknown): void {
    // Not used from runtime side — observer process sends these over pubsub
  }

  getState(_entityId: string, _field: string): Promise<unknown> {
    return Promise.reject(new Error('getState should be called from the observer process'));
  }

  callMethod(_entityId: string, _method: string, _payload?: unknown): Promise<unknown> {
    return Promise.reject(new Error('callMethod should be called from the observer process'));
  }

  getEntityTree(): Promise<EntityTree> {
    return Promise.reject(new Error('getEntityTree should be called from the observer process'));
  }

  // ─── Control plane listener (runtime side) ────────────

  async listen(
    tree: EntityTree,
    stateWrapper: StateWrapper,
    methodWrapper: MethodWrapper,
  ): Promise<void> {
    // state:set — fire and forget
    await this.pubsub.subscribe(OBSERVER_CHANNELS.stateSet, (msg: unknown) => {
      const { entityId, field, value } = msg as { entityId: string; field: string; value: unknown };
      const stateId = `${entityId}.${field}`;
      stateWrapper.handle(tree, null as any, stateId, 'set', [value]);
    });

    // state:get — request/response
    await this.pubsub.subscribe(OBSERVER_CHANNELS.stateGet, async (msg: unknown) => {
      const { entityId, field, replyChannel } = msg as { entityId: string; field: string; replyChannel: string };
      const stateId = `${entityId}.${field}`;
      const value = stateWrapper.handle(tree, null as any, stateId, 'get', []);
      await this.pubsub.publish(replyChannel, { value });
    });

    // method:call — request/response
    await this.pubsub.subscribe(OBSERVER_CHANNELS.methodCall, async (msg: unknown) => {
      const { method, payload, replyChannel } = msg as {
        method: string; payload?: unknown; replyChannel: string;
      };
      // Emit event for the call itself
      const entityId = method.split('.').slice(0, -1).join('.');
      const methodName = method.split('.').pop()!;
      const envelope = {
        id: `obs-${Date.now()}`, source: '__observer', target: entityId,
        type: methodName, payload, timestamp: Date.now(),
      };
      this.event(envelope);

      try {
        const result = await methodWrapper.handle(tree, null as any, method, 'invoke', [payload]);
        await this.pubsub.publish(replyChannel, { value: result });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        this.error(envelope, e);
        await this.pubsub.publish(replyChannel, { error: e.message });
      }
    });

    // entity:tree — request/response
    await this.pubsub.subscribe(OBSERVER_CHANNELS.entityTree, async (msg: unknown) => {
      const { replyChannel } = msg as { replyChannel: string };
      await this.pubsub.publish(replyChannel, { value: tree });
    });
  }
}
