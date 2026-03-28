import type { PubSubAdapter } from '../../pubsub/adapter.js';
import type { DatabaseAdapter } from '../../database/adapter.js';
import type { LogAdapter } from '../../logger/adapter.js';
import type { EntityNode, EntityNodeComponent, EntityTree, ElementDescriptor } from './types.js';

/**
 * EntitySession is scoped to a single entity path ID.
 * Provides path calculations, tree navigation, and infra resolution
 * relative to that ID. Wrappers create/cache sessions per registered element.
 */
export class EntitySession {
  readonly id: string;
  private readonly pubsubs: Map<string, PubSubAdapter>;
  private readonly databases: Map<string, DatabaseAdapter>;
  private readonly loggers: Map<string, LogAdapter>;
  private readonly tree: EntityTree;

  constructor(
    id: string,
    tree: EntityTree,
    pubsubs: Map<string, PubSubAdapter>,
    databases: Map<string, DatabaseAdapter>,
    loggers: Map<string, LogAdapter>,
  ) {
    this.id = id;
    this.tree = tree;
    this.pubsubs = pubsubs;
    this.databases = databases;
    this.loggers = loggers;
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

  private resolveNodeInfra(id: string): EntityNode['infra'] {
    const node = this.findNode(id);
    if (node) {
      const { pubsub, database, logger } = node.infra;
      if (pubsub || database || logger) return node.infra;
    }
    const parent = EntitySession.parentOf(id);
    if (parent) return this.resolveNodeInfra(parent);
    return this.tree.infra;
  }

  /** Resolved pubsub for this session's ID. */
  get pubsub(): PubSubAdapter {
    const name = this.resolveNodeInfra(this.id).pubsub;
    if (name && this.pubsubs.has(name)) return this.pubsubs.get(name)!;
    const first = this.pubsubs.values().next();
    if (!first.done) return first.value;
    throw new Error(`No pubsub adapter for "${this.id}"`);
  }

  /** Resolved database for this session's ID. */
  get database(): DatabaseAdapter | undefined {
    const name = this.resolveNodeInfra(this.id).database;
    if (name && this.databases.has(name)) return this.databases.get(name)!;
    const first = this.databases.values().next();
    return first.done ? undefined : first.value;
  }

  /** Resolved logger for this session's ID. */
  get logger(): LogAdapter | undefined {
    const name = this.resolveNodeInfra(this.id).logger;
    if (name && this.loggers.has(name)) return this.loggers.get(name)!;
    const first = this.loggers.values().next();
    return first.done ? undefined : first.value;
  }

  /** Resolve pubsub for an arbitrary ID. */
  pubsubFor(id: string): PubSubAdapter {
    const name = this.resolveNodeInfra(id).pubsub;
    if (name && this.pubsubs.has(name)) return this.pubsubs.get(name)!;
    return this.pubsub; // fallback to own
  }

  /** Check if this ID and another share the same pubsub (co-located). */
  isCoLocatedWith(otherId: string): boolean {
    return this.pubsub === this.pubsubFor(otherId);
  }
}
