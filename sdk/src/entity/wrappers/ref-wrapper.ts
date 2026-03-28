import { BaseWrapper, type EntityTree, type ElementDescriptor } from './base-wrapper.js';
import type { BaseEntity } from '../types.js';

interface RefEntry {
  element: ElementDescriptor;
  targetEntityType: string;
  targetInstance?: BaseEntity;
  resolvedTargetPath?: string;
}

export class RefWrapper extends BaseWrapper {
  private static _instance: RefWrapper | null = null;
  static instance(): RefWrapper { return (RefWrapper._instance ??= new RefWrapper()); }
  private constructor() { super(); }

  private entries = new Map<string, RefEntry>();
  private tree!: EntityTree;

  register(id: string, element: ElementDescriptor): void {
    const meta = element.metadata as { targetEntityType: string } | undefined;
    this.entries.set(id, { element, targetEntityType: meta?.targetEntityType ?? element.name });
  }

  init(tree: EntityTree, instances: Map<string, BaseEntity>): void {
    this.tree = tree;
    for (const [_id, entry] of this.entries) {
      const target = (entry.element.entity as any)[entry.element.name];
      if (target && typeof target === 'object' && 'id' in target) {
        entry.targetInstance = target as BaseEntity;
        entry.resolvedTargetPath = target.id;
      }
    }
  }

  handle(tree: EntityTree, _instance: BaseEntity, id: string, method: string, args: unknown[]): unknown {
    const entry = this.entries.get(id);
    if (!entry || !entry.targetInstance) return undefined;
    const targetPath = entry.resolvedTargetPath!;
    if (this.session(id).isCoLocatedWith(targetPath)) {
      const fn = (entry.targetInstance as any)[method];
      if (typeof fn === 'function') return fn.call(entry.targetInstance, ...args);
      return undefined;
    }
    return this.request(entry.element.entity.id, targetPath, `${entry.targetEntityType}.${method}`, args[0]);
  }

  async emitToRemote(id: string, channel: string, data: unknown): Promise<void> {
    await this.session(id).pubsub.publish(channel, data);
  }

  async listenFromRemote(id: string, channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.session(id).pubsub.subscribe(channel, (msg: unknown) => handler(msg));
  }
}
