import { BaseWrapper, type EntityTree, type ElementDescriptor } from './base-wrapper.js';
import { EntitySession } from './entity-session.js';
import type { BaseEntity } from '../types.js';
import { EntityStreamImpl, DistributedEntityStream } from '../stream/index.js';

type StreamHandler = (payload: unknown) => void;

interface StreamEntry {
  element: ElementDescriptor;
  handlers: Map<string, Set<StreamHandler>>;
  started: boolean;
  ended: boolean;
  distributed: boolean;
}

export class StreamWrapper extends BaseWrapper {
  private static _instance: StreamWrapper | null = null;
  static instance(): StreamWrapper { return (StreamWrapper._instance ??= new StreamWrapper()); }
  private constructor() { super(); }

  private entries = new Map<string, StreamEntry>();

  register(id: string, element: ElementDescriptor): void {
    this.entries.set(id, {
      element,
      handlers: new Map([['start', new Set()], ['data', new Set()], ['end', new Set()]]),
      started: false, ended: false,
      distributed: false,
    });
  }

  init(_tree: EntityTree, instances: Map<string, BaseEntity>): void {

    for (const [id, entry] of this.entries) {
      const entity = entry.element.entity as any;
      const propName = entry.element.name;
      const ownerPath = EntitySession.parentOf(id) ?? id.split('.')[0];

      const isDistributed = !this.isParentLocal(ownerPath, instances);
      entry.distributed = isDistributed;

      // Create or replace with the right stream type
      if (isDistributed && !(entity[propName] instanceof DistributedEntityStream)) {
        const channel = `stream:${ownerPath}.${propName}`;
        entity[propName] = new DistributedEntityStream(channel, this.session(id).pubsub);
      } else if (!isDistributed && !entity[propName]) {
        entity[propName] = new EntityStreamImpl();
      }

      if (isDistributed) {
        this.onDetachedLeaf(id, entry.element, instances);
      }
    }
  }

  /** Override: set up distributed subscriber when this stream's owner is a detached leaf. */
  protected onDetachedLeaf(id: string, _element: ElementDescriptor, _instances: Map<string, BaseEntity>): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const ownerPath = EntitySession.parentOf(id) ?? id.split('.')[0];
    const name = EntitySession.segmentOf(id);
    const channel = `stream:${ownerPath}.${name}`;

    this.listenFromRemote(id, channel, (data: unknown) => {
      const { event, payload } = data as { event: string; payload: unknown };
      const handlers = entry.handlers.get(event);
      if (handlers) for (const h of handlers) { try { h(payload); } catch (e) { console.error(`[stream] ${id} remote:`, e); } }
    });
  }

  handle(_tree: EntityTree, _instance: BaseEntity, id: string, method: string, args: unknown[]): unknown {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    switch (method) {
      case 'emit':
        this.fire(id, entry, 'start', undefined);
        this.fire(id, entry, 'data', args[0]);
        this.fire(id, entry, 'end', undefined);
        entry.started = false; entry.ended = false;
        return;
      case 'start': entry.started = true; entry.ended = false; this.fire(id, entry, 'start', undefined); return;
      case 'data': this.fire(id, entry, 'data', args[0]); return;
      case 'end': entry.ended = true; entry.started = false; this.fire(id, entry, 'end', undefined); return;
      case 'on': { const [ev, h] = args as [string, StreamHandler]; entry.handlers.get(ev)?.add(h); return; }
      case 'off': { const [ev, h] = args as [string, StreamHandler]; entry.handlers.get(ev)?.delete(h); return; }
    }
    return undefined;
  }

  private fire(id: string, entry: StreamEntry, event: string, payload: unknown) {
    const handlers = entry.handlers.get(event);
    if (handlers) for (const h of handlers) { try { h(payload); } catch (e) { console.error(`[stream] ${id}:`, e); } }
    if (entry.distributed) {
      const ownerPath = EntitySession.parentOf(id) ?? id.split('.')[0];
      const name = EntitySession.segmentOf(id);
      this.emitToRemote(id, `stream:${ownerPath}.${name}`, { event, payload });
    }
  }

  warnUnendedStreams(): void {
    for (const [id, e] of this.entries) if (e.started && !e.ended) console.warn(`[stream] ${id}: started but never ended`);
  }

  async emitToRemote(id: string, channel: string, data: unknown): Promise<void> {
    await this.session(id).pubsub.publish(channel, data);
  }

  async listenFromRemote(id: string, channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.session(id).pubsub.subscribe(channel, (msg: unknown) => handler(msg));
  }
}
