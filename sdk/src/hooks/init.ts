import type { InProcessHookRunner, InProcessHookHandler } from './runner.js';

export namespace Init {
  export interface Input {
    entityId: string;
    firstBoot: boolean;
  }

  class RunnerImpl implements InProcessHookRunner<Input> {
    async init(_config: Record<string, unknown>): Promise<void> {}

    register(emit: (data: Input) => void, config: Record<string, unknown>): void {
      emit({
        entityId: config.entityId as string,
        firstBoot: config.firstBoot as boolean,
      });
    }

    async stop(): Promise<void> {}
  }

  export function Runner(): InProcessHookHandler<Input> {
    return { __hookHandler: true, runnerClass: RunnerImpl, config: {}, inProcess: true };
  }
}
