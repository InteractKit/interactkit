import type { HookRunner, HookHandler } from './runner.js';

export namespace Event {
  export interface Input<T = unknown> {
    eventName: string;
    payload: T;
    source: string;
  }

  class RunnerImpl implements HookRunner<Input> {
    private emitFn?: (data: Input) => void;

    async start(emit: (data: Input) => void, _config: Record<string, unknown>): Promise<void> {
      this.emitFn = emit;
    }

    /** Called by the runtime when an event is received. */
    fire(eventName: string, payload: unknown, source: string): void {
      this.emitFn?.({ eventName, payload, source });
    }

    async stop(): Promise<void> {
      this.emitFn = undefined;
    }
  }

  export function Runner(): HookHandler<Input> {
    return { __hookHandler: true, runnerClass: RunnerImpl, config: {}, inProcess: false };
  }
}
