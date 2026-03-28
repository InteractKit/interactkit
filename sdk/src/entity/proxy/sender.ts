import { randomUUID } from 'node:crypto';
import type { PubSubAdapter } from '../../pubsub/adapter.js';
import type { ProxyMessage } from './types.js';
import type { ProxyKind } from './serializable.js';

type PendingResolve = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/**
 * Creates a sender-side proxy for a remote object.
 * Property access, method calls, and sets are sent over a central pubsub channel.
 * Responses are matched by correlationId. Non-serializable responses become nested proxies.
 *
 * The proxy shape matches the proxyKind — functions are callable, class instances
 * have property access, iterables support for-of.
 */
export function createSenderProxy(
  objectId: string,
  channel: string,
  pubsub: PubSubAdapter,
  kind: ProxyKind = 'object',
  cleanup?: FinalizationRegistry<string>,
): unknown {
  const pending = new Map<string, PendingResolve>();
  let subscribed = false;

  async function ensureSubscribed() {
    if (subscribed) return;
    subscribed = true;
    await pubsub.subscribe(channel, (msg: unknown) => {
      const response: ProxyMessage = JSON.parse(msg as string);
      if (response.op !== 'response') return;
      const p = pending.get(response.correlationId);
      if (!p) return;
      pending.delete(response.correlationId);

      if (response.error) {
        p.reject(new Error(response.error));
      } else if (response.proxyId) {
        // Non-serializable response — create a nested proxy
        p.resolve(createSenderProxy(response.proxyId, channel, pubsub, response.proxyKind ?? 'object', cleanup));
      } else {
        p.resolve(response.value);
      }
    });
  }

  function send(op: ProxyMessage['op'], prop?: string, args?: unknown[]): Promise<unknown> {
    const correlationId = randomUUID();
    const msg: ProxyMessage = { correlationId, objectId, op, prop, args };

    return new Promise<unknown>(async (resolve, reject) => {
      pending.set(correlationId, { resolve, reject });
      await ensureSubscribed();
      await pubsub.enqueue(channel, JSON.stringify(msg) as any);

      // Timeout after 30s
      setTimeout(() => {
        if (pending.has(correlationId)) {
          pending.delete(correlationId);
          reject(new Error(`Proxy timeout: ${op} ${prop ?? ''} on ${objectId}`));
        }
      }, 30_000);
    });
  }

  // Build the proxy target based on kind
  const target = kind === 'function'
    ? function () {} // callable proxy
    : {};

  const proxy = new Proxy(target, {
    get(_t, prop) {
      if (prop === '__proxyObjectId') return objectId;
      if (prop === '__proxyChannel') return channel;
      if (prop === 'then') return undefined; // prevent auto-thenable detection
      if (typeof prop === 'symbol') return undefined;

      const propStr = String(prop);

      // Return an async function for method calls
      return (...args: unknown[]) => {
        // If called with no args, treat as property get
        if (args.length === 0) return send('get', propStr);
        // Otherwise treat as method call
        return send('call', propStr, args);
      };
    },

    set(_t, prop, value) {
      if (typeof prop === 'symbol') return false;
      send('set', String(prop), [value]);
      return true;
    },

    apply(_t, _thisArg, args) {
      // For function-kind proxies — call the remote function directly
      return send('call', undefined, args);
    },
  });

  // Register with FinalizationRegistry for cleanup
  if (cleanup) {
    cleanup.register(proxy, objectId);
  }

  return proxy;
}
