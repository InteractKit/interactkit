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
      }
    }
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
          if (!bus) { const s = this.session(targetId); bus = new EventBus(s.pubsub, s.logger); }
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
