import { randomUUID } from 'node:crypto';
import { BaseWrapper, type EntityTree, type EntityNode, type EntityNodeComponent, type ElementDescriptor } from './base-wrapper.js';
import type { BaseEntity } from '../types.js';
import { EventBus } from '../../events/bus.js';

interface RefEntry {
  element: ElementDescriptor;
  targetEntityType: string;
  targetInstance?: BaseEntity;
  resolvedTargetPath?: string;
  remote: boolean;
}

export class RefWrapper extends BaseWrapper {
  private static _instance: RefWrapper | null = null;
  static instance(): RefWrapper { return (RefWrapper._instance ??= new RefWrapper()); }
  private constructor() { super(); }

  private entries = new Map<string, RefEntry>();
  private tree!: EntityTree;

  register(id: string, element: ElementDescriptor): void {
    const meta = element.metadata as { targetEntityType: string } | undefined;
    this.entries.set(id, { element, targetEntityType: meta?.targetEntityType ?? element.name, remote: false });
  }

  init(tree: EntityTree, instances: Map<string, BaseEntity>): void {
    this.tree = tree;
    for (const [id, entry] of this.entries) {
      const target = (entry.element.entity as any)[entry.element.name];
      if (target && typeof target === 'object' && 'id' in target) {
        entry.targetInstance = target as BaseEntity;
        entry.resolvedTargetPath = target.id;
      } else {
        // Target not in this process — resolve the target path from the tree and create a remote proxy
        const targetPath = this.resolveRefTargetPath(id, entry.targetEntityType, tree);
        if (targetPath && !instances.has(targetPath)) {
          entry.remote = true;
          entry.resolvedTargetPath = targetPath;
          this.createRemoteProxy(id, entry, targetPath);
        }
      }
    }
  }

  handle(tree: EntityTree, _instance: BaseEntity, id: string, method: string, args: unknown[]): unknown {
    const entry = this.entries.get(id);
    if (!entry || !entry.targetInstance) return undefined;
    const targetPath = entry.resolvedTargetPath!;

    if (!entry.remote && this.session(id).isCoLocatedWith(targetPath)) {
      const fn = (entry.targetInstance as any)[method];
      if (typeof fn === 'function') return fn.call(entry.targetInstance, ...args);
      return undefined;
    }

    return this.request(entry.element.entity.id, targetPath, `${entry.targetEntityType}.${method}`, args[0]);
  }

  /**
   * Resolve a ref's target path by walking the tree.
   * A ref at `parent.child.refProp` targets a sibling component under `parent`
   * that has the matching entityType.
   */
  private resolveRefTargetPath(refId: string, targetEntityType: string, tree: EntityTree): string | undefined {
    const segments = refId.split('.');
    if (segments.length < 2) return undefined;

    // The ref lives on an entity — find its parent (grandparent of the ref)
    const parentPath = segments.slice(0, -2).join('.');
    const parentNode = parentPath ? this.findNode(tree, parentPath) : tree;
    if (!parentNode) return undefined;

    // Find the sibling component with the target entity type
    const sibling = parentNode.components.find(c => c.entityType === targetEntityType);
    if (!sibling) return undefined;

    return parentPath ? `${parentPath}.${sibling.propertyName}` : sibling.propertyName;
  }

  private findNode(tree: EntityTree, path: string): EntityNode | undefined {
    const segments = path.split('.');
    let current: EntityNode | undefined = tree;
    // Skip first segment if it matches tree root
    const start = (segments[0] === tree.type || segments[0] === tree.id?.split('.')[0]) ? 1 : 0;
    for (let i = start; i < segments.length && current; i++) {
      const found: EntityNodeComponent | undefined = current.components.find(c => c.propertyName === segments[i]);
      current = found?.entity;
    }
    return current;
  }

  /** Create a remote proxy for a ref target that lives in another process. */
  private createRemoteProxy(refId: string, entry: RefEntry, targetPath: string): void {
    const entity = entry.element.entity as any;
    const entityType = entry.targetEntityType;
    let bus: EventBus | null = null;

    const proxy = new Proxy({} as any, {
      get: (_t, prop) => {
        if (prop === 'id') return targetPath;
        if (prop === '__entityType') return entityType;
        if (prop === '__remote') return true;
        if (prop === 'then') return undefined;
        if (typeof prop === 'symbol') return undefined;
        const p = String(prop);

        return async (...args: unknown[]) => {
          if (!bus) { const s = this.session(targetPath); bus = new EventBus(s.pubsub, s.logger); }
          return bus.request({
            id: randomUUID(), source: entity.id, target: targetPath,
            type: `${entityType}.${p}`, payload: args[0], timestamp: Date.now(),
          });
        };
      },
    });

    entity[entry.element.name] = proxy;
    entry.targetInstance = proxy;
  }

  async emitToRemote(id: string, channel: string, data: unknown): Promise<void> {
    await this.session(id).pubsub.publish(channel, data);
  }

  async listenFromRemote(id: string, channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.session(id).pubsub.subscribe(channel, (msg: unknown) => handler(msg));
  }
}
