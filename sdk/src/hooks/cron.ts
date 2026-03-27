import type { HookRunner, HookHandler } from './runner.js';

export namespace Cron {
  export interface Input {
    lastRun: Date;
  }

  class RunnerImpl implements HookRunner<Input> {
    private timer?: ReturnType<typeof setInterval>;
    private lastRun = new Date(0);

    async start(emit: (data: Input) => void, config: Record<string, unknown>): Promise<void> {
      const expression = config.expression as string;
      if (!expression) throw new Error('Cron.Runner requires config.expression');

      this.timer = setInterval(() => {
        if (this.matchesCron(expression, new Date())) {
          const lastRun = this.lastRun;
          this.lastRun = new Date();
          emit({ lastRun });
        }
      }, 60_000);
    }

    async stop(): Promise<void> {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    }

    private matchesCron(expression: string, now: Date): boolean {
      const parts = expression.trim().split(/\s+/);
      if (parts.length !== 5) return false;

      const fields = [
        now.getMinutes(),
        now.getHours(),
        now.getDate(),
        now.getMonth() + 1,
        now.getDay(),
      ];

      return parts.every((part, i) => {
        if (part === '*') return true;
        if (part.includes('/')) {
          const [, step] = part.split('/');
          return fields[i] % Number(step) === 0;
        }
        if (part.includes(',')) {
          return part.split(',').map(Number).includes(fields[i]);
        }
        return Number(part) === fields[i];
      });
    }
  }

  export function Runner(config: { expression: string }): HookHandler<Input> {
    return { __hookHandler: true, runnerClass: RunnerImpl, config, inProcess: false };
  }
}
