import type { HookRunner } from './runner.js';

export namespace Init {
  export interface Input {
    entityId: string;
    firstBoot: boolean;
  }

  class RunnerImpl implements HookRunner<Input> {
    async init(_config: Record<string, unknown>): Promise<void> {}

    register(emit: (data: Input) => void, config: Record<string, unknown>): void {
      emit({
        entityId: config.entityId as string,
        firstBoot: config.firstBoot as boolean,
      });
    }

    async stop(): Promise<void> {}
  }

  export function Runner() {
    return { __hookHandler: true as const, runnerClass: RunnerImpl, config: {}, inProcess: true as const };
  }
}
