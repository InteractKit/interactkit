import type { HookRunner, HookHandler } from '../hooks/runner.js';
import type { PubSubAdapter } from '../pubsub/adapter.js';
import type { LogAdapter } from '../logger/adapter.js';

interface ActiveRunner {
  channel: string;
  runner: HookRunner<any>;
}

/**
 * Runs hook runners and enqueues events into pubsub.
 *
 * Each startRunner call creates one runner that enqueues to
 * hook:{entityType}.{method}. Entities consume from that channel.
 */
export class HookExecutor {
  private runners: ActiveRunner[] = [];

  constructor(
    private pubsub: PubSubAdapter,
    private logger?: LogAdapter,
  ) {}

  async startRunner(entityType: string, method: string, handler: HookHandler): Promise<void> {
    const runner = new handler.runnerClass();
    const channel = `hook:${entityType}.${method}`;
    this.runners.push({ channel, runner });

    await runner.start(
      (data) => {
        this.logger?.event({
          id: '', source: 'hook-server', target: entityType,
          type: `${entityType}.${method}`, payload: data, timestamp: Date.now(),
        });
        this.pubsub.enqueue(channel, JSON.stringify(data));
      },
      handler.config,
    );
  }

  async stopAll(): Promise<void> {
    for (const entry of this.runners) {
      await entry.runner.stop();
    }
    this.runners = [];
  }
}
