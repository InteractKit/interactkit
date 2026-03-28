import { BaseWrapper, type EntityTree, type ElementDescriptor } from './base-wrapper.js';
import type { BaseEntity } from '../types.js';

interface MethodEntry { element: ElementDescriptor; fn: Function }

export class MethodWrapper extends BaseWrapper {
  private static _instance: MethodWrapper | null = null;
  static instance(): MethodWrapper { return (MethodWrapper._instance ??= new MethodWrapper()); }
  private constructor() { super(); }

  private entries = new Map<string, MethodEntry>();
  private listeningEntities = new Set<string>();

  register(id: string, element: ElementDescriptor): void {
    const entity = element.entity as any;
    const fn = entity[element.name];
    if (typeof fn === 'function') this.entries.set(id, { element, fn: fn.bind(entity) });
  }

  init(_tree: EntityTree, instances: Map<string, BaseEntity>): void {
    // For each method, check if its owner entity's parent is NOT local.
    // If so, this entity is a detached leaf — set up an EventBus listener
    // so remote parents can call its methods.
    const entityListeners = new Map<string, BaseEntity>();

    for (const [id, entry] of this.entries) {
      const entityPath = this.session(id).parentPath ?? id.split('.')[0];
      if (!this.isParentLocal(entityPath, instances) && !entityListeners.has(entityPath)) {
        entityListeners.set(entityPath, entry.element.entity);
      }
    }

    for (const [entityId, instance] of entityListeners) {
      this.setupRemoteListener(entityId, instance);
    }
  }

  handle(_tree: EntityTree, _instance: BaseEntity, id: string, method: string, args: unknown[]): unknown {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (method === 'invoke') return entry.fn(...args);
    return undefined;
  }

  /** Set up an EventBus listener for a detached entity so remote callers can invoke its methods. */
  private setupRemoteListener(entityId: string, instance: BaseEntity): void {
    if (this.listeningEntities.has(entityId)) return;
    this.listeningEntities.add(entityId);

    this.listen(entityId, async (envelope) => {
      const methodName = envelope.type.split('.').pop()!;
      const fn = (instance as any)[methodName];
      if (typeof fn === 'function') return fn.call(instance, envelope.payload);
      throw new Error(`Method "${methodName}" not found on entity "${entityId}"`);
    });
  }

  async emitToRemote(id: string, channel: string, data: unknown): Promise<void> {
    await this.session(id).pubsub.publish(channel, data);
  }

  async listenFromRemote(id: string, channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.session(id).pubsub.subscribe(channel, (msg: unknown) => handler(msg));
  }
}
