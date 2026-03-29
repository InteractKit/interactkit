import cron from 'node-cron';
import type { HookRunner, HookHandler } from '@interactkit/sdk';

// ─── Cron Hook ──────────────────────────────────────────
// Fires on a cron schedule using node-cron.
//
// Init config (from interactkit.config.ts): { cron: { timezone?: string } }
// Run config (from @Hook decorator): { expression: string }

export namespace Cron {
  export interface Input {
    lastRun: Date;
    expression: string;
  }

  export interface Config {
    expression: string;
  }

  class RunnerImpl implements HookRunner<Input> {
    private timezone?: string;
    private tasks: cron.ScheduledTask[] = [];

    async init(config: Record<string, unknown>): Promise<void> {
      const cronConfig = config.cron as Record<string, unknown> | undefined;
      this.timezone = cronConfig?.timezone as string | undefined;
    }

    register(emit: (data: Input) => void, config: Record<string, unknown>): void {
      const expression = config.expression as string;
      if (!expression) throw new Error('Cron.Runner requires config.expression');

      if (!cron.validate(expression)) {
        throw new Error(`Invalid cron expression: "${expression}"`);
      }

      let lastRun = new Date(0);

      const task = cron.schedule(expression, () => {
        const prev = lastRun;
        lastRun = new Date();
        emit({ lastRun: prev, expression });
      }, {
        timezone: this.timezone,
      });

      this.tasks.push(task);
    }

    async stop(): Promise<void> {
      for (const task of this.tasks) task.stop();
      this.tasks = [];
    }
  }

  export function Runner(config: Config): HookHandler<Input> {
    return {
      __hookHandler: true,
      runnerClass: RunnerImpl,
      config: config as unknown as Record<string, unknown>,
      initConfig: {},
    };
  }
}
