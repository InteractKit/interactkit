import type { PubSubAdapter } from '../../pubsub/adapter.js';
import type { DatabaseAdapter } from '../../database/adapter.js';
import type { ObserverAdapter } from '../../observer/adapter.js';
import type { EntityNode, EntityNodeComponent, EntityTree, ElementDescriptor } from './types.js';

/**
 * EntitySession is scoped to a single entity path ID.
 * Provides path calculations, tree navigation, and infra resolution
 * relative to that ID. Wrappers create/cache sessions per registered element.
 */
export class EntitySession {
  readonly id: string;
  private readonly localPubsub: PubSubAdapter;
  private readonly remotePubsub: PubSubAdapter | undefined;
  private readonly db: DatabaseAdapter | undefined;
  private readonly obs: ObserverAdapter | undefined;
  private readonly tree: EntityTree;

  constructor(
    id: string,
    tree: EntityTree,
    localPubsub: PubSubAdapter,
    remotePubsub: PubSubAdapter | undefined,
    database: DatabaseAdapter | undefined,
    observer: ObserverAdapter | undefined,
  ) {
    this.id = id;
    this.tree = tree;
    this.localPubsub = localPubsub;
    this.remotePubsub = remotePubsub;
    this.db = database;
    this.obs = observer;
  }

  // ─── Path calculations (relative to this.id) ─────────

  get rootType(): string { return this.id.split('.')[0]; }

  get parentPath(): string | undefined {
    const i = this.id.lastIndexOf('.');
    return i > 0 ? this.id.slice(0, i) : undefined;
  }

  get name(): string {
    const i = this.id.lastIndexOf('.');
    return i > 0 ? this.id.slice(i + 1) : this.id;
  }

  get depth(): number { return this.id.split('.').length - 1; }
  get isRoot(): boolean { return !this.id.includes('.'); }

  isDescendantOf(ancestor: string): boolean { return this.id.startsWith(ancestor + '.'); }
  child(childName: string): string { return `${this.id}.${childName}`; }

  // ─── Static path helpers (for arbitrary IDs) ──────────

  static parentOf(id: string): string | undefined {
    const i = id.lastIndexOf('.');
    return i > 0 ? id.slice(0, i) : undefined;
  }

  static segmentOf(id: string): string {
    const i = id.lastIndexOf('.');
    return i > 0 ? id.slice(i + 1) : id;
  }

  static depthOf(id: string): number { return id.split('.').length - 1; }
  static isRootId(id: string): boolean { return !id.includes('.'); }
  static childOf(parentId: string, childName: string): string { return `${parentId}.${childName}`; }

  // ─── Tree navigation ──────────────────────────────────

  /** Find the node for this session's ID. */
  get node(): EntityNode | undefined { return this.findNode(this.id); }

  findNode(id: string): EntityNode | undefined {
    const segments = id.split('.');
    if (segments.length === 1 && segments[0] === this.tree.type) return this.tree;
    let current: EntityNode | undefined = this.tree;
    for (let i = 1; i < segments.length && current; i++) {
      const found: EntityNodeComponent | undefined = current.components.find(c => c.propertyName === segments[i]);
      current = found?.entity;
    }
    return current;
  }

  /** Sibling component paths of this session's ID. */
  get siblings(): string[] {
    const parent = this.parentPath;
    if (!parent) return [];
    const parentNode = this.findNode(parent);
    if (!parentNode) return [];
    const myName = this.name;
    return parentNode.components
      .filter(c => c.propertyName !== myName)
      .map(c => `${parent}.${c.propertyName}`);
  }

  /** All descendant paths from this session's ID. */
  get descendants(): string[] {
    return this.descendantsOf(this.id);
  }

  descendantsOf(id: string): string[] {
    const node = this.findNode(id);
    if (!node) return [];
    const result: string[] = [];
    for (const comp of node.components) {
      const childId = `${id}.${comp.propertyName}`;
      result.push(childId);
      result.push(...this.descendantsOf(childId));
    }
    return result;
  }

  /** All elements attached to this session's node. */
  get attachments(): Array<{ name: string; kind: ElementDescriptor['kind'] }> {
    const node = this.node;
    if (!node) return [];
    return [
      ...node.state.map(s => ({ name: s.name, kind: 'state' as const })),
      ...node.methods.map(m => ({ name: m.methodName, kind: 'method' as const })),
      ...node.hooks.map(h => ({ name: h.methodName, kind: 'hook' as const })),
      ...node.streams.map(s => ({ name: s.propertyName, kind: 'stream' as const })),
      ...node.components.map(c => ({ name: c.propertyName, kind: 'component' as const })),
      ...node.refs.map(r => ({ name: r.propertyName, kind: 'ref' as const })),
    ];
  }

  // ─── Infra resolution ─────────────────────────────────

  /** Whether the given entity node (or its parent entity) is detached. */
  private isDetached(id: string): boolean {
    // Try the exact ID first, then walk up to find the nearest entity node
    let current = id;
    while (current) {
      const node = this.findNode(current);
      if (node) return node.infra.detached ?? false;
      const parent = EntitySession.parentOf(current);
      if (!parent) break;
      current = parent;
    }
    return false;
  }

  /** Resolved pubsub — remote if detached, local otherwise. */
  get pubsub(): PubSubAdapter {
    if (this.isDetached(this.id) && this.remotePubsub) return this.remotePubsub;
    return this.localPubsub;
  }

  /** Global database adapter (configured in interactkit.config.ts). */
  get database(): DatabaseAdapter | undefined {
    return this.db;
  }

  /** Global observer (configured in interactkit.config.ts). */
  get observer(): ObserverAdapter | undefined {
    return this.obs;
  }

  /** Resolve pubsub for an arbitrary ID (e.g. a target entity). */
  pubsubFor(id: string): PubSubAdapter {
    if (this.isDetached(id) && this.remotePubsub) return this.remotePubsub;
    return this.localPubsub;
  }

  /** Check if this ID and another share the same pubsub (co-located). */
  isCoLocatedWith(otherId: string): boolean {
    return this.pubsub === this.pubsubFor(otherId);
  }
}
