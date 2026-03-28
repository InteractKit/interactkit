import { BaseWrapper, type EntityTree, type ElementDescriptor } from './base-wrapper.js';
import type { BaseEntity } from '../types.js';
import type { HookRunner } from '../../hooks/runner.js';

interface HookMeta { runnerClass: new () => HookRunner<unknown>; config: Record<string, unknown>; inProcess: boolean }
interface HookEntry { element: ElementDescriptor; meta?: HookMeta; runner?: HookRunner<unknown> }

export class HookWrapper extends BaseWrapper {
  private static _instance: HookWrapper | null = null;
  static instance(): HookWrapper { return (HookWrapper._instance ??= new HookWrapper()); }
  private constructor() { super(); }

  private entries = new Map<string, HookEntry>();

  register(id: string, element: ElementDescriptor): void {
    this.entries.set(id, { element, meta: element.metadata as HookMeta | undefined });
  }

  init(_tree: EntityTree, _instances: Map<string, BaseEntity>): void {
    for (const [id, entry] of this.entries) {
      if (!entry.meta) continue;
      const entity = entry.element.entity as any;
      const methodFn = entity[entry.element.name];
      if (typeof methodFn !== 'function') continue;

      const runner = new entry.meta.runnerClass();
      entry.runner = runner;

      if (entry.meta.inProcess) {
        runner.start((data: unknown) => methodFn.call(entity, data), { ...entry.meta.config, entityId: entity.id, firstBoot: true });
      } else {
        // Runner runs in a separate process — entity just listens via pubsub
        const channel = `hook:${entry.element.entityType}.${entry.element.name}`;
        this.listenFromRemote(id, channel, (data: unknown) => methodFn.call(entity, data));
      }
    }
  }

  handle(_tree: EntityTree, _instance: BaseEntity, id: string, method: string, args: unknown[]): unknown {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (method === 'dispatch') {
      const entity = entry.element.entity as any;
      const fn = entity[entry.element.name];
      if (typeof fn === 'function') return fn.call(entity, args[0]);
    }
    return undefined;
  }

  async stopAll(): Promise<void> {
    for (const entry of this.entries.values()) await entry.runner?.stop();
  }

  async shutdown(): Promise<void> {
    await this.stopAll();
  }

  async emitToRemote(id: string, channel: string, data: unknown): Promise<void> {
    await this.session(id).pubsub.publish(channel, data);
  }

  async listenFromRemote(id: string, channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.session(id).pubsub.subscribe(channel, (msg: unknown) => handler(msg));
  }
}
