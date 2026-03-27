/**
 * A hook runner is a typed event source.
 * T is the hook input type this runner handles.
 *
 * - start: begin listening, call emit(data) when external data arrives
 * - stop: tear down
 */
export interface HookRunner<T> {
  start(emit: (data: T) => void, config: Record<string, unknown>): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Returned by Runner(config) factory functions.
 * Carries the runner class + config so the @Hook decorator can store both.
 */
export interface HookHandler<T = any> {
  readonly __hookHandler: true;
  readonly runnerClass: new (...args: any[]) => HookRunner<T>;
  readonly config: Record<string, unknown>;
  readonly inProcess?: boolean;
}
