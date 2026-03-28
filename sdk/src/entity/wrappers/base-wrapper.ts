import { randomUUID } from 'node:crypto';
import type { BaseEntity } from '../types.js';
import type { PubSubAdapter } from '../../pubsub/adapter.js';
import type { DatabaseAdapter } from '../../database/adapter.js';
import type { LogAdapter } from '../../logger/adapter.js';
import type { EventEnvelope } from '../../events/types.js';
import { EventBus } from '../../events/bus.js';
import { EntitySession } from './entity-session.js';
import type { EntityTree, ElementDescriptor, WrapperInfra } from './types.js';

// Re-export types so existing consumers don't break
export type { EntityTree, EntityNode, EntityNodeComponent, ElementDescriptor, WrapperInfra, NamedPubSub, NamedDatabase, NamedLogger } from './types.js';

/**
 * Abstract singleton base for all wrappers.
 *
 * Path/tree/infra logic lives in EntitySession (one per registered ID).
 * BaseWrapper provides session creation + infra convenience methods.
 */
export abstract class BaseWrapper {
  // ─── Shared infra (set once, used by all wrappers) ────

  private static pubsubs: Map<string, PubSubAdapter>;
  private static databases: Map<string, DatabaseAdapter>;
  private static loggers: Map<string, LogAdapter>;
  private static tree: EntityTree;
  private static busCache = new Map<string, EventBus>();
  private static configured = false;

  static configure(infra: WrapperInfra): void {
    BaseWrapper.pubsubs = new Map(infra.pubsubs.map(p => [p.name, p.adapter]));
    BaseWrapper.databases = new Map(infra.databases.map(d => [d.name, d.adapter]));
    BaseWrapper.loggers = new Map(infra.loggers.map(l => [l.name, l.adapter]));
    BaseWrapper.busCache.clear();
    BaseWrapper.configured = true;
  }

  static setTree(tree: EntityTree): void { BaseWrapper.tree = tree; }

  protected constructor() {
    if (!BaseWrapper.configured) {
      throw new Error('BaseWrapper.configure(infra) must be called before creating wrapper instances');
    }
  }

  // ─── Abstract interface ───────────────────────────────

  abstract register(id: string, element: ElementDescriptor): void;
  abstract init(tree: EntityTree, instances: Map<string, BaseEntity>): void | Promise<void>;
  abstract handle(tree: EntityTree, instance: BaseEntity, id: string, method: string, args: unknown[]): unknown;
  async shutdown(): Promise<void> {}

  // ─── Detached leaf lifecycle ───────────────────────────

  /** Check if a path's parent is local (booted in this process). */
  protected isParentLocal(id: string, instances: Map<string, BaseEntity>): boolean {
    const parent = EntitySession.parentOf(id);
    return !parent || instances.has(parent);
  }

  /** Called when this wrapper detects an element whose owner is a detached leaf (parent not local). */
  protected onDetachedLeaf(_id: string, _element: ElementDescriptor, _instances: Map<string, BaseEntity>): void {}

  // ─── Remote communication (abstract — each wrapper implements) ──

  /** Send data to a remote entity's channel. PubSubAdapter handles serialization — pass raw data. */
  abstract emitToRemote(id: string, channel: string, data: unknown): Promise<void>;

  /** Listen for data from a remote entity's channel. Handler receives deserialized data. */
  abstract listenFromRemote(id: string, channel: string, handler: (data: unknown) => void): Promise<void>;

  // ─── Session factory ──────────────────────────────────

  private static sessionCache = new Map<string, EntitySession>();

  /** Get or create a cached EntitySession scoped to a path ID. */
  protected session(id: string): EntitySession {
    let s = BaseWrapper.sessionCache.get(id);
    if (!s) {
      s = new EntitySession(id, BaseWrapper.tree, BaseWrapper.pubsubs, BaseWrapper.databases, BaseWrapper.loggers);
      BaseWrapper.sessionCache.set(id, s);
    }
    return s;
  }

  // ─── EventBus (cached per pubsub adapter) ─────────────

  protected resolveBus(id: string): EventBus {
    const s = this.session(id);
    const key = s.node?.infra.pubsub ?? '__default';
    if (!BaseWrapper.busCache.has(key)) {
      BaseWrapper.busCache.set(key, new EventBus(s.pubsub, s.logger));
    }
    return BaseWrapper.busCache.get(key)!;
  }

  // ─── Database convenience ─────────────────────────────

  protected async dbGet(id: string): Promise<Record<string, unknown> | null> {
    return this.session(id).database?.get(id) ?? null;
  }

  protected async dbSet(id: string, state: Record<string, unknown>): Promise<void> {
    await this.session(id).database?.set(id, state);
  }

  protected async dbDelete(id: string): Promise<void> {
    await this.session(id).database?.delete(id);
  }

  // ─── PubSub convenience (no serialization — PubSubAdapter handles it) ──

  protected async broadcast(id: string, channel: string, data: unknown): Promise<void> {
    await this.session(id).pubsub.publish(`${id}:${channel}`, data);
  }

  protected async subscribeTo(id: string, channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.session(id).pubsub.subscribe(`${id}:${channel}`, handler);
  }

  protected async unsubscribeFrom(id: string, channel: string): Promise<void> {
    await this.session(id).pubsub.unsubscribe(`${id}:${channel}`);
  }

  protected async enqueue(id: string, channel: string, data: unknown): Promise<void> {
    await this.session(id).pubsub.enqueue(`${id}:${channel}`, data);
  }

  protected async consume(id: string, channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.session(id).pubsub.consume(`${id}:${channel}`, handler);
  }

  protected async stopConsuming(id: string, channel: string): Promise<void> {
    await this.session(id).pubsub.stopConsuming(`${id}:${channel}`);
  }

  // ─── Event Bus convenience ────────────────────────────

  protected async request(sourceId: string, targetId: string, type: string, payload: unknown): Promise<unknown> {
    const envelope: EventEnvelope = { id: randomUUID(), source: sourceId, target: targetId, type, payload, timestamp: Date.now() };
    return this.resolveBus(targetId).request(envelope);
  }

  protected async listen(id: string, handler: (envelope: EventEnvelope) => Promise<unknown>): Promise<void> {
    await this.resolveBus(id).listen(id, handler);
  }

  protected async fireAndForget(sourceId: string, targetId: string, type: string, payload: unknown): Promise<void> {
    const envelope: EventEnvelope = { id: randomUUID(), source: sourceId, target: targetId, type, payload, timestamp: Date.now() };
    await this.resolveBus(targetId).publish(envelope);
  }

  // ─── Logging convenience ──────────────────────────────

  protected logEvent(id: string, envelope: EventEnvelope): void {
    this.session(id).logger?.event(envelope);
  }

  protected logError(id: string, envelope: EventEnvelope, error: Error): void {
    this.session(id).logger?.error(envelope, error);
  }

  static async destroyAll(): Promise<void> {
    for (const bus of BaseWrapper.busCache.values()) await bus.destroy();
    BaseWrapper.busCache.clear();
    BaseWrapper.sessionCache.clear();
  }
}
