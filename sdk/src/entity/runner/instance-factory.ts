import type { BaseEntity, EntityConstructor } from '../types.js';
import type { EntityTree, EntityNode, EntityNodeComponent } from '../wrappers/base-wrapper.js';

/**
 * Creates and caches entity instances by deterministic path IDs.
 * Resolves shared instances for refs (ref → sibling component).
 */
export class InstanceFactory {
  private instances = new Map<string, BaseEntity>();
  private tree: EntityTree;

  constructor(tree: EntityTree) { this.tree = tree; }

  getInstance<T extends BaseEntity>(id: string, Cls: EntityConstructor): T {
    const resolvedId = this.resolveSharedId(id);
    if (this.instances.has(resolvedId)) return this.instances.get(resolvedId)! as T;
    const instance = new Cls() as T;
    (instance as any).id = resolvedId;
    this.instances.set(resolvedId, instance);
    return instance;
  }

  get(id: string): BaseEntity | undefined { return this.instances.get(this.resolveSharedId(id)); }
  getAll(): Map<string, BaseEntity> { return new Map(this.instances); }

  private resolveSharedId(id: string): string {
    const segments = id.split('.');
    if (segments.length < 2) return id;
    const parentPath = segments.slice(0, -1).join('.');
    const propName = segments[segments.length - 1];
    const parentNode = this.findNode(parentPath);
    if (!parentNode) return id;
    const ref = parentNode.refs.find(r => r.propertyName === propName);
    if (!ref) return id;
    const grandparentPath = parentPath.split('.').slice(0, -1).join('.');
    const grandparentNode = grandparentPath ? this.findNode(grandparentPath) : this.tree;
    if (!grandparentNode) return id;
    const siblingComp = grandparentNode.components.find(c => c.entityType === ref.targetEntityType);
    if (!siblingComp) return id;
    return grandparentPath ? `${grandparentPath}.${siblingComp.propertyName}` : siblingComp.propertyName;
  }

  private findNode(path: string): EntityNode | undefined {
    const segments = path.split('.');
    if (segments.length === 1 && segments[0] === this.tree.type) return this.tree;
    let current: EntityNode | undefined = this.tree;
    for (let i = 1; i < segments.length && current; i++) {
      const found: EntityNodeComponent | undefined = current.components.find(c => c.propertyName === segments[i]);
      current = found?.entity;
    }
    return current;
  }
}
