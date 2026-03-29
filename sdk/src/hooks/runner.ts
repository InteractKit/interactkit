/**
 * A hook runner is a typed event source.
 * T is the hook input type this runner handles.
 *
 * - init: set up shared resources (server, timer, connection) using config from interactkit.config.ts
 * - register: add an emit callback with per-entity run config
 * - stop: tear down resources
 */
export interface HookRunner<T> {
  init(config: Record<string, unknown>): Promise<void>;
  register(emit: (data: T) => void, config: Record<string, unknown>): void;
  stop(): Promise<void>;
}

/**
 * Returned by Runner(config) factory functions.
 * Carries the runner class + run config so the @Hook decorator can store both.
 */
export interface HookHandler<T = any> {
  readonly __hookHandler: true;
  readonly runnerClass: new (...args: any[]) => HookRunner<T>;
  /** Per-entity run config — passed to register() */
  readonly config: Record<string, unknown>;
  /** Default init config — merged with overrides from interactkit.config.ts hooks */
  readonly initConfig?: Record<string, unknown>;
  readonly inProcess?: boolean;
}
