/**
 * Reactive state proxy — wraps entity.state with dirty tracking
 * and debounced auto-flush to database.
 *
 * Tracks shallow sets and intercepts array mutators.
 * For deep nested mutations, call entity.save() manually.
 */

import type { DatabaseAdapter } from './database/adapter.js';
import type { ObserverAdapter } from './observer/adapter.js';

const ARRAY_MUTATORS = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'] as const;

export interface ReactiveOptions {
  entityId: string;
  db: DatabaseAdapter;
  flushMs: number;
  observer?: ObserverAdapter;
}

export function createReactiveState(
  initial: Record<string, any>,
  options: ReactiveOptions,
): Record<string, any> {
  let dirty = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      if (!dirty) return;
      dirty = false;
      try {
        await options.db.set(options.entityId, initial);
      } catch (err) {
        // Re-mark dirty so next flush retries
        dirty = true;
        console.error(`[reactive] flush failed for ${options.entityId}:`, err);
      }
    }, options.flushMs);
  }

  function markDirty(field?: string) {
    dirty = true;
    if (options.observer && field) {
      options.observer.setState(options.entityId, field, initial[field]);
    }
    scheduleFlush();
  }

  // Wrap arrays to intercept mutator methods
  function wrapArray(arr: any[], field: string): any[] {
    return new Proxy(arr, {
      get(target, prop) {
        const val = Reflect.get(target, prop);
        if (typeof prop === 'string' && ARRAY_MUTATORS.includes(prop as any) && typeof val === 'function') {
          return function (this: any, ...args: any[]) {
            const result = val.apply(target, args);
            markDirty(field);
            return result;
          };
        }
        return val;
      },
      set(target, prop, value) {
        const result = Reflect.set(target, prop, value);
        if (typeof prop === 'string' && prop !== 'length') {
          markDirty(field);
        }
        return result;
      },
    });
  }

  return new Proxy(initial, {
    get(target, prop) {
      const val = target[prop as string];
      if (Array.isArray(val) && typeof prop === 'string') {
        return wrapArray(val, prop);
      }
      return val;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      markDirty(prop as string);
      return true;
    },
  });
}

/**
 * Flush any pending state writes immediately.
 * Call during shutdown to avoid data loss.
 */
export async function flushReactiveState(
  state: Record<string, any>,
  entityId: string,
  db: DatabaseAdapter,
): Promise<void> {
  await db.set(entityId, state);
}
