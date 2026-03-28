import { randomUUID } from 'node:crypto';
import {
  isSerializable,
  classifyForProxy,
  type ProxyKind,
} from "../entity/proxy/serializable.js";
import { ProxyReceiver } from "../entity/proxy/receiver.js";
import type { ProxyMessage } from "../entity/proxy/types.js";

type MessageHandler = (message: unknown) => void;

/**
 * Abstract PubSub adapter — the unified interface for all pubsub transports.
 *
 * Subclasses choose their own serialization strategy:
 *   - LocalPubSubAdapter: passes values by reference (zero-copy, same process)
 *   - RemotePubSubAdapter: JSON serialization + automatic proxy for non-serializable values
 */
export abstract class PubSubAdapter {
  abstract publish(channel: string, message: unknown): Promise<void>;
  abstract subscribe(channel: string, handler: MessageHandler): Promise<void>;
  abstract unsubscribe(channel: string): Promise<void>;
  abstract enqueue(channel: string, message: unknown): Promise<void>;
  abstract consume(channel: string, handler: MessageHandler): Promise<void>;
  abstract stopConsuming(channel: string): Promise<void>;
}

// ─── Local adapter (same process, pass by reference) ──────────────

/**
 * Base for in-process adapters. Passes values directly by reference —
 * no serialization, no proxy overhead. Functions, class instances, etc.
 * work natively because they never leave the process.
 */
export abstract class LocalPubSubAdapter extends PubSubAdapter {
  /** Broadcast — all handlers get the value. */
  abstract publish(channel: string, message: unknown): Promise<void>;
  abstract subscribe(channel: string, handler: MessageHandler): Promise<void>;
  abstract unsubscribe(channel: string): Promise<void>;

  /** Queue — one consumer gets the value. */
  abstract enqueue(channel: string, message: unknown): Promise<void>;
  abstract consume(channel: string, handler: MessageHandler): Promise<void>;
  abstract stopConsuming(channel: string): Promise<void>;
}

// ─── Remote adapter (cross-process, serialization + proxy) ────────

/** Wire-level proxy reference for non-serializable values. */
interface ProxyRef {
  __proxy: true;
  objectId: string;
  kind: ProxyKind;
  channel: string;
}

/** Serialized envelope that wraps any message for transport. */
interface Wire {
  payload: unknown;
  proxies?: Record<string, ProxyRef>;
}

/**
 * Base for cross-process adapters (Redis, NATS, etc.).
 *
 * Handles JSON serialization automatically. Non-serializable values
 * (functions, class instances) are registered with a ProxyReceiver and
 * re-created as live proxies on the consumer side.
 */
export abstract class RemotePubSubAdapter extends PubSubAdapter {
  private receiver: ProxyReceiver | null = null;
  private readonly proxyChannel = `__proxy:${randomUUID().slice(0, 8)}`;

  /** GC cleanup — when a sender proxy is collected, send dispose to free the remote object. */
  private readonly proxyGC = new FinalizationRegistry<{
    channel: string;
    objectId: string;
  }>((ref) => {
    const msg: ProxyMessage = {
      correlationId: "",
      objectId: ref.objectId,
      op: "dispose",
    };
    this.enqueueRaw(ref.channel, JSON.stringify(msg)).catch(() => {});
  });

  private getReceiver(): ProxyReceiver {
    if (!this.receiver) {
      this.receiver = new ProxyReceiver(this.proxyChannel, this);
      this.receiver.listen();
    }
    return this.receiver;
  }

  // ─── Public API (accepts any value, serializes automatically) ──

  async publish(channel: string, message: unknown): Promise<void> {
    const wire = this.packMessage(message);
    await this.publishRaw(channel, JSON.stringify(wire));
  }

  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    await this.subscribeRaw(channel, (raw) => {
      const wire: Wire = JSON.parse(raw);
      handler(this.unpackMessage(wire));
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.unsubscribeRaw(channel);
  }

  async enqueue(channel: string, message: unknown): Promise<void> {
    const wire = this.packMessage(message);
    await this.enqueueRaw(channel, JSON.stringify(wire));
  }

  async consume(channel: string, handler: MessageHandler): Promise<void> {
    await this.consumeRaw(channel, (raw) => {
      const wire: Wire = JSON.parse(raw);
      handler(this.unpackMessage(wire));
    });
  }

  async stopConsuming(channel: string): Promise<void> {
    await this.stopConsumingRaw(channel);
  }

  // ─── Serialization ────────────────────────────────────

  private packMessage(message: unknown): Wire {
    if (isSerializable(message)) {
      return { payload: message };
    }

    // Non-serializable — proxy the whole thing so mutations propagate
    const kind = classifyForProxy(message);
    const objectId = this.getReceiver().register(message);
    return {
      payload: null,
      proxies: { $: { __proxy: true, objectId, kind, channel: this.proxyChannel } },
    };
  }

  private unpackMessage(wire: Wire): unknown {
    if (wire.proxies?.['$']) {
      const ref = wire.proxies['$'];
      return this.createLiveProxy(ref);
    }
    return wire.payload;
  }

  // ─── Live proxy creation (sender side) ────────────────

  /** Send a proxy op asynchronously. */
  private async sendProxyOp(channel: string, objectId: string, op: string, prop?: string, args?: unknown[]): Promise<unknown> {
    const correlationId = randomUUID();
    const replyChannel = `__proxy_reply:${correlationId}`;
    const msg: ProxyMessage = { correlationId, objectId, op: op as any, prop, args, replyChannel };

    let resolve!: (v: unknown) => void;
    let reject!: (e: Error) => void;
    const resultPromise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });

    const timer = setTimeout(() => {
      this.unsubscribeRaw(replyChannel);
      reject(new Error(`Proxy timeout: ${op} ${prop ?? ''} on ${objectId}`));
    }, 30_000);

    await this.subscribeRaw(replyChannel, (raw) => {
      clearTimeout(timer);
      this.unsubscribeRaw(replyChannel);
      const response: ProxyMessage = JSON.parse(raw);
      if (response.error) {
        reject(new Error(response.error));
      } else if (response.proxyId && response.proxyKind) {
        resolve(this.createLiveProxy({ __proxy: true, objectId: response.proxyId, kind: response.proxyKind, channel }));
      } else {
        resolve(response.value);
      }
    });

    await this.enqueueRaw(channel, JSON.stringify(msg));
    return resultPromise;
  }

  private createLiveProxy(ref: ProxyRef): unknown {
    const adapter = this;
    const target = ref.kind === 'function' ? function () {} : {};

    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === '__proxyObjectId') return ref.objectId;
        if (prop === '__proxyRemote') return true;
        if (prop === 'then') return undefined;
        if (typeof prop === 'symbol') return undefined;

        // Return a callable + thenable: awaiting reads the property, calling invokes the method.
        // `await proxy.name` → get op → returns value
        // `await proxy.method(args)` → call op → returns result
        const callable = (...args: unknown[]) => {
          return adapter.sendProxyOp(ref.channel, ref.objectId, 'call', String(prop), args);
        };
        callable.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          adapter.sendProxyOp(ref.channel, ref.objectId, 'get', String(prop)).then(resolve, reject);
        };
        return callable;
      },
      set(_t, prop, value) {
        if (typeof prop === 'symbol') return false;
        adapter.sendProxyOp(ref.channel, ref.objectId, 'set', String(prop), [value]);
        return true;
      },
      apply(_t, _thisArg, args) {
        return adapter.sendProxyOp(ref.channel, ref.objectId, 'call', undefined, args);
      },
    });

    this.proxyGC.register(proxy, {
      channel: ref.channel,
      objectId: ref.objectId,
    });

    return proxy;
  }

  // ─── Abstract: raw string transport (subclasses implement) ──

  protected abstract publishRaw(channel: string, message: string): Promise<void>;
  protected abstract subscribeRaw(channel: string, handler: (message: string) => void): Promise<void>;
  protected abstract unsubscribeRaw(channel: string): Promise<void>;
  protected abstract enqueueRaw(channel: string, message: string): Promise<void>;
  protected abstract consumeRaw(channel: string, handler: (message: string) => void): Promise<void>;
  protected abstract stopConsumingRaw(channel: string): Promise<void>;
}
