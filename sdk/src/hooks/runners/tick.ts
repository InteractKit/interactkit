import type { HookRunner } from '../runner.js';
import type { TickInput } from '../types.js';

/**
 * TickRunner — emits at a fixed interval.
 * Config: { intervalMs: number } (default 60000)
 */
export class TickRunner implements HookRunner<TickInput> {
  private timer?: ReturnType<typeof setInterval>;
  private tickCount = 0;
  private startTime = 0;

  async start(emit: (data: TickInput) => void, config: Record<string, unknown>): Promise<void> {
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
