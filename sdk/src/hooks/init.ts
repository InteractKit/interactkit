import type { HookRunner, HookHandler } from './runner.js';

export namespace Init {
  export interface Input {
    entityId: string;
    firstBoot: boolean;
  }

  class RunnerImpl implements HookRunner<Input> {
    async start(emit: (data: Input) => void, config: Record<string, unknown>): Promise<void> {
      // Fire once immediately during boot
      emit({
        entityId: config.entityId as string,
        firstBoot: config.firstBoot as boolean,
      });
    }

    async stop(): Promise<void> {}
  }

  export function Runner(): HookHandler<Input> {
    return { __hookHandler: true, runnerClass: RunnerImpl, config: {} };
  }
}
