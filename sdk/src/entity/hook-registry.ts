import type { PubSubAdapter } from '../pubsub/adapter.js';

export interface HookRegistration {
  entityType: string;
  method: string;
  /** The runner expression key — unique per hook config (e.g. "Tick:5000", "Cron:0 9 * * *") */
  runnerKey: string;
  /** Serialized runner config */
  config: Record<string, unknown>;
  /** Hook namespace name (e.g. "Init", "Tick", "Cron", "HttpRequest") */
  hookType: string;
}

/**
 * Global hook registry.
 *
 * Entities register their hooks at boot time. The hook server reads the
 * registry to know what runners to start and who to relay events to.
 *
 * Backed by pubsub: entities broadcast registrations, the hook server
 * collects them. Also maintains a local map for in-process mode.
 */
export class HookRegistry {
  private registrations: HookRegistration[] = [];
  private listeners: Array<(reg: HookRegistration) => void> = [];

  constructor(private pubsub: PubSubAdapter) {}

  /** Entity calls this at boot to register a hook. */
  async register(reg: HookRegistration): Promise<void> {
    this.registrations.push(reg);
    // Broadcast so the hook server (possibly in another process) picks it up
    await this.pubsub.publish('hook:registry', JSON.stringify(reg));
    // Also notify local listeners (in-process mode)
    for (const listener of this.listeners) listener(reg);
  }

  /** Hook server calls this to receive registrations from entities. */
  async listen(handler: (reg: HookRegistration) => void): Promise<void> {
    this.listeners.push(handler);
    // Deliver any registrations that already happened (in-process boot order)
    for (const reg of this.registrations) handler(reg);
    // Subscribe for registrations from other processes
    await this.pubsub.subscribe('hook:registry', (message) => {
      const reg: HookRegistration = JSON.parse(message);
      // Avoid duplicates from our own broadcast in the same process
      if (!this.registrations.includes(reg)) {
        this.registrations.push(reg);
      }
      handler(reg);
    });
  }

  /** Get all current registrations. */
  getAll(): HookRegistration[] {
    return [...this.registrations];
  }

  /** Get all unique subscriber channels for a given runner key. */
  getSubscribers(runnerKey: string): string[] {
    return this.registrations
      .filter(r => r.runnerKey === runnerKey)
      .map(r => `hook:${r.entityType}.${r.method}`);
  }
}
