import { BaseWrapper, type EntityTree, type ElementDescriptor } from './base-wrapper.js';
import { EntitySession } from './entity-session.js';
import type { BaseEntity } from '../types.js';

interface StateEntry { element: ElementDescriptor; value: unknown; dirty: boolean }

export class StateWrapper extends BaseWrapper {
  private static _instance: StateWrapper | null = null;
  static instance(): StateWrapper { return (StateWrapper._instance ??= new StateWrapper()); }
  private constructor() { super(); }

  private entries = new Map<string, StateEntry>();
  private flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private tree!: EntityTree;
  private readonly origin = Math.random().toString(36).slice(2);

  register(id: string, element: ElementDescriptor): void {
    this.entries.set(id, { element, value: (element.entity as any)[element.name], dirty: false });
  }

  async init(tree: EntityTree, instances: Map<string, BaseEntity>): Promise<void> {
    this.tree = tree;
    for (const [id, entry] of this.entries) {
      const entity = entry.element.entity as any;
      const name = entry.element.name;
      const self = this, stateId = id;

      await this.loadState(stateId, entry);

      Object.defineProperty(entity, name, {
        get() { return self.entries.get(stateId)!.value; },
        set(v: unknown) {
          const e = self.entries.get(stateId)!;
          e.value = Array.isArray(v) ? self.wrapArray(stateId, v) : v;
          e.dirty = true;
          self.scheduleFlush(stateId);
        },
        enumerable: true, configurable: true,
      });

      if (Array.isArray(entry.value)) entry.value = this.wrapArray(id, entry.value);
    }

    // Subscribe to cross-replica sync — once per entity path
    const subscribedPaths = new Set<string>();
    for (const [id] of this.entries) {
      const entityPath = EntitySession.parentOf(id) ?? id.split('.')[0];
      if (!subscribedPaths.has(entityPath)) {
        subscribedPaths.add(entityPath);
        this.subscribeSync(id);
      }
    }
  }

  handle(_tree: EntityTree, _instance: BaseEntity, id: string, method: string, args: unknown[]): unknown {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (method === 'get') return entry.value;
    if (method === 'set') {
      entry.value = Array.isArray(args[0]) ? this.wrapArray(id, args[0] as unknown[]) : args[0];
      entry.dirty = true; this.scheduleFlush(id);
    }
    if (method === 'flush') return this.flush(id);
    return undefined;
  }

  private async loadState(id: string, entry: StateEntry) {
    const entityPath = EntitySession.parentOf(id) ?? EntitySession.segmentOf(id.split('.')[0]);
    const persisted = await this.dbGet(entityPath);
    if (persisted) { const prop = EntitySession.segmentOf(id); if (prop in persisted) entry.value = persisted[prop]; }
  }

  private scheduleFlush(id: string) {
    if (this.flushTimers.has(id)) return;
    this.flushTimers.set(id, setTimeout(() => { this.flushTimers.delete(id); this.flush(id); }, 10));
  }

  private async flush(id: string) {
    const entry = this.entries.get(id);
    if (!entry || !entry.dirty) return;
    entry.dirty = false;
    const entityPath = EntitySession.parentOf(id) ?? EntitySession.segmentOf(id.split('.')[0]);
    const stateObj: Record<string, unknown> = {};
    for (const [sid, se] of this.entries) {
      if ((EntitySession.parentOf(sid) ?? sid.split('.')[0]) === entityPath) stateObj[EntitySession.segmentOf(sid)] = se.value;
    }
    await this.dbSet(entityPath, stateObj);
    await this.broadcast(entityPath, 'state', { origin: this.origin, state: stateObj });
  }

  private async subscribeSync(id: string) {
    const entityPath = EntitySession.parentOf(id) ?? EntitySession.segmentOf(id.split('.')[0]);
    await this.subscribeTo(entityPath, 'state', (data: unknown) => {
      const msg = data as { origin: string; state: Record<string, unknown> };
      if (msg.origin === this.origin) return;
      for (const [sid, se] of this.entries) {
        if ((EntitySession.parentOf(sid) ?? sid.split('.')[0]) !== entityPath) continue;
        const prop = EntitySession.segmentOf(sid);
        if (prop in msg.state) se.value = msg.state[prop];
      }
    });
  }

  private wrapArray(id: string, arr: unknown[]): unknown[] {
    const self = this;
    const mutators = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'];
    return new Proxy(arr, {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);
        if (typeof prop === 'string' && mutators.includes(prop) && typeof val === 'function') {
          return (...args: unknown[]) => {
            const result = (val as Function).apply(target, args);
            const e = self.entries.get(id); if (e) { e.dirty = true; self.scheduleFlush(id); }
            return result;
          };
        }
        return val;
      },
      set(target, prop, value, receiver) {
        const result = Reflect.set(target, prop, value, receiver);
        if (typeof prop === 'string' && !isNaN(Number(prop))) {
          const e = self.entries.get(id); if (e) { e.dirty = true; self.scheduleFlush(id); }
        }
        return result;
      },
    });
  }

  async flushAll(): Promise<void> {
    for (const t of this.flushTimers.values()) clearTimeout(t);
    this.flushTimers.clear();
    for (const id of this.entries.keys()) await this.flush(id);
  }

  async shutdown(): Promise<void> {
    await this.flushAll();
  }

  async emitToRemote(id: string, channel: string, data: unknown): Promise<void> {
    await this.session(id).pubsub.publish(channel, data);
  }

  async listenFromRemote(id: string, channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.session(id).pubsub.subscribe(channel, (msg: unknown) => handler(msg));
  }
}
