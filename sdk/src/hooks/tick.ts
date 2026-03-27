import type { HookRunner, HookHandler } from './runner.js';

export namespace Tick {
  export interface Input {
    tick: number;
    elapsed: number;
  }

  class RunnerImpl implements HookRunner<Input> {
    private timer?: ReturnType<typeof setInterval>;
    private tickCount = 0;
    private startTime = 0;

    async start(emit: (data: Input) => void, config: Record<string, unknown>): Promise<void> {
      const intervalMs = (config.intervalMs as number) ?? 60_000;
      this.startTime = Date.now();
      this.tickCount = 0;

      this.timer = setInterval(() => {
        this.tickCount++;
        emit({
          tick: this.tickCount,
          elapsed: Date.now() - this.startTime,
        });
      }, intervalMs);
    }

    async stop(): Promise<void> {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    }
  }

  export function Runner(config: { intervalMs: number } = { intervalMs: 60000 }): HookHandler<Input> {
    return { __hookHandler: true, runnerClass: RunnerImpl, config, inProcess: false };
  }
}
