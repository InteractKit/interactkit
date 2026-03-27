import type { BaseEntity } from './types.js';
import type { InfraContext } from './infra.js';

const ARRAY_MUTATORS = new Set([
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin',
]);

/**
 * Replaces @State properties with reactive getter/setters.
 *
 * - Setter marks dirty, schedules a debounced flush (10ms)
 * - Flush saves all state to DB and broadcasts to other replicas
 * - Array mutations (push, pop, etc.) also trigger dirty
 * - State sync from other replicas writes to backing store directly (no re-broadcast)
 */
export async function wireReactiveState(
  instance: BaseEntity,
  stateKeys: string[],
  entityId: string,
  instanceId: string,
  infra: InfraContext,
): Promise<void> {
  if (stateKeys.length === 0) return;

  const stateStore: Record<string, unknown> = {};

  const flushState = async () => {
    const snapshot: Record<string, unknown> = {};
    for (const key of stateKeys) snapshot[key] = stateStore[key];
    if (infra.database) {
      await infra.database.set(entityId, snapshot);
    }
    if (infra.pubsub) {
      await infra.pubsub.publish(
        `state:${entityId}`,
        JSON.stringify({ origin: instanceId, state: snapshot }),
      );
    }
  };

  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const markDirty = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushState().catch(err => console.error(`[state-flush] ${entityId}:`, err.message));
    }, 10);
  };

  const wrapValue = (val: unknown): unknown => {
    if (Array.isArray(val)) {
      return new Proxy(val, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof prop === 'string' && ARRAY_MUTATORS.has(prop) && typeof value === 'function') {
            return (...args: unknown[]) => {
              const result = value.apply(target, args);
              markDirty();
              return result;
            };
          }
          return value;
        },
        set(target, prop, value, receiver) {
          const result = Reflect.set(target, prop, value, receiver);
          markDirty();
          return result;
        },
      });
    }
    return val;
  };

  // Replace properties with getter/setter pairs
  for (const key of stateKeys) {
    stateStore[key] = (instance as any)[key];
    Object.defineProperty(instance, key, {
      get: () => wrapValue(stateStore[key]),
      set: (val: unknown) => {
        stateStore[key] = val;
        markDirty();
      },
      enumerable: true,
      configurable: true,
    });
  }

  // Subscribe to state sync from other replicas (skip own broadcasts)
  if (infra.pubsub) {
    await infra.pubsub.subscribe(`state:${entityId}`, (message) => {
      const { origin, state } = JSON.parse(message) as { origin: string; state: Record<string, unknown> };
      if (origin === instanceId) return;
      for (const key of stateKeys) {
        if (key in state) stateStore[key] = state[key];
      }
    });
  }
}
