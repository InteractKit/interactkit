import type { HookRunner } from '../runner.js';
import type { InitInput } from '../types.js';

/**
 * InitRunner — fires once on boot.
 * The runtime calls emit() directly during boot, so this runner
 * just tracks whether it has already fired.
 */
export class InitRunner implements HookRunner<InitInput> {
  private emitFn?: (data: InitInput) => void;

  async start(emit: (data: InitInput) => void, config: Record<string, unknown>): Promise<void> {
    this.emitFn = emit;
  }

  /** Called by the runtime during boot. */
  fire(entityId: string, firstBoot: boolean): void {
    this.emitFn?.({ entityId, firstBoot });
  }

  async stop(): Promise<void> {
    this.emitFn = undefined;
  }
}
