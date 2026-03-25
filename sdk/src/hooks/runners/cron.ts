import type { HookRunner } from '../runner.js';
import type { CronInput } from '../types.js';

/**
 * CronRunner — emits on a cron schedule.
 * Config: { expression: string } (e.g. "0 * * * *")
 *
 * Uses a simple polling approach — checks every minute if the cron
 * expression matches the current time. For production use, consider
 * replacing with a proper cron library.
 */
export class CronRunner implements HookRunner<CronInput> {
  private timer?: ReturnType<typeof setInterval>;
  private lastRun = new Date(0);

  async start(emit: (data: CronInput) => void, config: Record<string, unknown>): Promise<void> {
    const expression = config.expression as string;
    if (!expression) throw new Error('CronRunner requires config.expression');

    // Poll every 60s and check if cron matches
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

  /** Simple cron matching — supports basic 5-field cron expressions. */
  private matchesCron(expression: string, now: Date): boolean {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const fields = [
      now.getMinutes(),  // minute
      now.getHours(),    // hour
      now.getDate(),     // day of month
      now.getMonth() + 1, // month (1-based)
      now.getDay(),      // day of week (0=Sun)
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
