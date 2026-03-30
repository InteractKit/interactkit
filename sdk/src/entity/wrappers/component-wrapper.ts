import { randomUUID } from 'node:crypto';
import { BaseWrapper, type EntityTree, type ElementDescriptor } from './base-wrapper.js';
import type { BaseEntity } from '../types.js';
import { EventBus } from '../../events/bus.js';
import { DistributedStreamSubscriber } from '../stream/index.js';

interface ComponentEntry {
  element: ElementDescriptor;
  childEntityType: string;
  childInstance?: BaseEntity;
  childPath?: string;
  remote: boolean;
}

export class ComponentWrapper extends BaseWrapper {
  private static _instance: ComponentWrapper | null = null;
  static instance(): ComponentWrapper { return (ComponentWrapper._instance ??= new ComponentWrapper()); }
  private constructor() { super(); }

  private entries = new Map<string, ComponentEntry>();

  register(id: string, element: ElementDescriptor): void {
    const meta = element.metadata as { entityType: string } | undefined;
    this.entries.set(id, { element, childEntityType: meta?.entityType ?? element.name, remote: false });
  }

  init(_tree: EntityTree, instances: Map<string, BaseEntity>): void {
    for (const [id, entry] of this.entries) {
      const entity = entry.element.entity as any;
      const child = entity[entry.element.name];

      if (child && typeof child === 'object' && 'id' in child) {
        entry.childInstance = child as BaseEntity;
        entry.childPath = child.id;
      }

      // If child entity not in this process → detached leaf
      if (!instances.has(id)) {
        entry.remote = true;
        this.onDetachedLeaf(id, entry.element, instances);
      } else if (entry.childInstance) {
        // Wrap local child in an observer proxy so events are visible
        this.wrapLocalChild(id, entry);
      }
    }
  }

  /** Wrap a local child instance in a proxy that notifies the observer on method calls. */
  private wrapLocalChild(id: string, entry: ComponentEntry): void {
    const child = entry.childInstance!;
    const entity = entry.element.entity as any;
    const session = this.session(id);
    const entityType = entry.childEntityType;
    const sourceId = entity.id;
    const targetId = entry.childPath ?? id;

    const proxy = new Proxy(child, {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);
        if (typeof prop === 'symbol' || typeof val !== 'function') return val;
        if (prop === 'constructor') return val;

        return function (this: unknown, ...args: unknown[]) {
          const observer = session.observer;
          const envelope = observer ? {
            id: randomUUID(), source: sourceId, target: targetId,
            type: `${entityType}.${String(prop)}`, payload: args[0], timestamp: Date.now(),
          } : null;

          if (envelope) observer!.event(envelope);

          try {
            const result = val.apply(target, args);
            if (result && typeof result === 'object' && typeof result.catch === 'function') {
              return (result as Promise<unknown>).catch((err: unknown) => {
                const e = err instanceof Error ? err : new Error(String(err));
                if (envelope) observer!.error(envelope, e);
                throw err;
              });
            }
            return result;
          } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            if (envelope) observer!.error(envelope, e);
            throw err;
          }
        };
      },
    });

    entity[entry.element.name] = proxy;
    entry.childInstance = proxy;
  }

  handle(_tree: EntityTree, _instance: BaseEntity, id: string, method: string, args: unknown[]): unknown {
    const entry = this.entries.get(id);
    if (!entry || !entry.childInstance) return undefined;

    if (!entry.remote) {
      const fn = (entry.childInstance as any)[method];
      if (typeof fn === 'function') return fn.call(entry.childInstance, ...args);
      return undefined;
    }

    return this.request(entry.element.entity.id, entry.childPath!, `${entry.childEntityType}.${method}`, args[0]);
  }

  /** Create a remote proxy for a detached child component. */
  protected onDetachedLeaf(id: string, element: ElementDescriptor, _instances: Map<string, BaseEntity>): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const entity = element.entity as any;

    const node = this.session(id).findNode(id);
    const streamProps = new Set(node?.streams.map(s => s.propertyName) ?? []);
    const streamCache = new Map<string, DistributedStreamSubscriber<unknown>>();
    const targetId = id;
    const entityType = entry.childEntityType;
    let bus: EventBus | null = null;

    const proxy = new Proxy({} as any, {
      get: (_t, prop) => {
        if (prop === 'id') return targetId;
        if (prop === '__entityType') return entityType;
        if (prop === '__remote') return true;
        if (prop === 'then') return undefined;
        if (typeof prop === 'symbol') return undefined;
        const p = String(prop);

        if (streamProps.has(p)) {
          if (!streamCache.has(p)) {
            const s = this.session(targetId);
            streamCache.set(p, new DistributedStreamSubscriber(`stream:${targetId}.${p}`, s.pubsub));
          }
          return streamCache.get(p)!;
        }

        return async (...args: unknown[]) => {
          if (!bus) { const s = this.session(targetId); bus = new EventBus(s.pubsub, s.observer); }
          return bus.request({
            id: randomUUID(), source: entity.id, target: targetId,
            type: `${entityType}.${p}`, payload: args[0], timestamp: Date.now(),
          });
        };
      },
    });

    entity[element.name] = proxy;
    entry.childInstance = proxy;
    entry.childPath = targetId;
  }

  async emitToRemote(id: string, channel: string, data: unknown): Promise<void> {
    await this.session(id).pubsub.publish(channel, data);
  }

  async listenFromRemote(id: string, channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.session(id).pubsub.subscribe(channel, (msg: unknown) => handler(msg));
  }
}
