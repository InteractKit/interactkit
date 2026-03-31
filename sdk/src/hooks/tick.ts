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
    private intervalMs = 60_000;

    async init(config: Record<string, unknown>): Promise<void> {
      this.intervalMs = (config.intervalMs as number) ?? 60_000;
    }

    register(emit: (data: Input) => void, _config: Record<string, unknown>): void {
      this.startTime = Date.now();
      this.tickCount = 0;
      this.timer = setInterval(() => {
        this.tickCount++;
        emit({ tick: this.tickCount, elapsed: Date.now() - this.startTime });
      }, this.intervalMs);
    }

    async stop(): Promise<void> {
      if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    }
  }

  export function Runner(config: { intervalMs: number } = { intervalMs: 60000 }): HookHandler<Input> {
    return { __hookHandler: true, runnerClass: RunnerImpl, config, inProcess: true };
  }
}
