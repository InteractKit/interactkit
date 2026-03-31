/**
 * Base hook runner — shared contract for all hook event sources.
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
 * In-process hook runner — runs inside the entity process.
 * Use for lightweight hooks (Init, Tick, timers, internal events).
 */
export interface InProcessHookRunner<T> extends HookRunner<T> {}

/**
 * Remote hook runner — runs in the separate _hooks.ts process.
 * Use for hooks that own shared resources (HTTP server, WebSocket server, cron scheduler).
 */
export interface RemoteHookRunner<T> extends HookRunner<T> {}

// ─── Handlers (returned by Runner() factories) ─────────────

/** Shared fields for all hook handlers. */
interface HookHandlerBase<T = any> {
  readonly __hookHandler: true;
  /** Per-entity run config — passed to register() */
  readonly config: Record<string, unknown>;
  /** Default init config — merged with overrides from interactkit.config.ts hooks */
  readonly initConfig?: Record<string, unknown>;
}

/**
 * In-process hook handler — init + register + stop all run inside the entity process.
 */
export interface InProcessHookHandler<T = any> extends HookHandlerBase<T> {
  readonly runnerClass: new (...args: any[]) => InProcessHookRunner<T>;
  readonly inProcess: true;
}

/**
 * Remote hook handler — runs in the separate _hooks.ts process.
 * Entity processes send register events via pubsub; the hook process manages the runner.
 */
export interface RemoteHookHandler<T = any> extends HookHandlerBase<T> {
  readonly runnerClass: new (...args: any[]) => RemoteHookRunner<T>;
  readonly inProcess: false;
}

/** Union of both hook handler types. */
export type HookHandler<T = any> = InProcessHookHandler<T> | RemoteHookHandler<T>;
