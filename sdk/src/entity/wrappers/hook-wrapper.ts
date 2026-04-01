import { BaseWrapper, type EntityTree, type ElementDescriptor } from './base-wrapper.js';
import type { BaseEntity } from '../types.js';
import type { HookRunner } from '../../hooks/runner.js';

interface HookMeta { runnerClass: new () => HookRunner<unknown>; config: Record<string, unknown>; initConfig?: Record<string, unknown>; inProcess: boolean }
interface HookEntry { element: ElementDescriptor; meta?: HookMeta; runner?: HookRunner<unknown> }

export class HookWrapper extends BaseWrapper {
  private static _instance: HookWrapper | null = null;
  static instance(): HookWrapper { return (HookWrapper._instance ??= new HookWrapper()); }
  private constructor() { super(); }

  private entries = new Map<string, HookEntry>();

  register(id: string, element: ElementDescriptor): void {
    this.entries.set(id, { element, meta: element.metadata as HookMeta | undefined });
  }

  async init(_tree: EntityTree, _instances: Map<string, BaseEntity>): Promise<void> {
    const hooksConfig = BaseWrapper.getHooksConfig();

    for (const [id, entry] of this.entries) {
      if (!entry.meta) continue;
      const entity = entry.element.entity as any;
      const methodFn = entity[entry.element.name];
      if (typeof methodFn !== 'function') continue;

      const hookKey = `${entry.element.entityType}.${entry.element.name}`;

      if (entry.meta.inProcess) {
        // ─── Local: init + register + stop all in this process ───
        const runner = new entry.meta.runnerClass();
        entry.runner = runner;
        await runner.init({ ...entry.meta.initConfig, ...entry.meta.config, ...hooksConfig });
        runner.register(
          (data: unknown) => { Promise.resolve(methodFn.call(entity, data)).catch((err) => { console.error(`[hook] ${hookKey} error:`, err); }); },
          { ...entry.meta.config, entityId: entity.id, firstBoot: true },
        );
      } else {
        // ─── Remote: _hooks.ts owns the runner ───
        // Remote hooks always communicate via the remote pubsub (DevPubSubAdapter/Redis),
        // even if the entity itself is not detached, because _hooks.ts is a separate process.
        const remotePubsub = this.session(id).remotePubsubAdapter;
        if (!remotePubsub) throw new Error(`Remote hook "${hookKey}" requires a pubsub adapter in config`);

        // 1. Listen for data published by the hook process
        const dataChannel = `hook:${hookKey}:${entity.id}`;
        await remotePubsub.subscribe(dataChannel, (msg: unknown) => methodFn.call(entity, msg));

        // 2. Tell the hook process to register this entity (enqueue for reliable delivery)
        const registerChannel = `hook-register:${hookKey}`;
        await remotePubsub.enqueue(registerChannel, {
          entityId: entity.id,
          dataChannel,
          config: { ...entry.meta.config, entityId: entity.id },
        });
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
