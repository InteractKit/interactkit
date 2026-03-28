/**
 * Type-safe proxy wrapper for cross-process entity communication.
 *
 * - Methods always return `Promise<...>` (async call over the wire)
 * - Serializable return types (string, number, plain objects, arrays) resolve as-is
 * - Non-serializable return types (functions, class instances with methods) become `Remote<T>`
 * - Properties become `Promise<T>` (async access)
 *
 * Example:
 *   const counter: Remote<Counter> = await this.worker.getCounter();
 *   const val: number = await counter.increment(); // number, not Remote<number>
 *   const name: string = await this.worker.getName(); // string, not Promise<string>
 */
export type Remote<T> = {
  [K in keyof T]: T[K] extends EntityStreamLike
    ? T[K]  // Streams pass through — runtime handles stream proxying separately
    : T[K] extends (...args: infer A) => infer R
      ? (...args: A) => Promise<Remotify<Awaited<R>>>
      : Promise<Awaited<T[K]>>;
};

/** Matches EntityStream<any> without importing it (avoids circular deps). */
type EntityStreamLike = { emit(payload: any): void; on(event: string, handler: (...args: any[]) => void): void };

/** Serializable types pass through unchanged. Non-serializable get wrapped in Remote<T>. */
type Remotify<T> =
  T extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Remotify<Awaited<R>>>
    : T extends string | number | boolean | null | undefined
      ? T
      : T extends (infer U)[]
        ? Remotify<U>[]
        : HasMethods<T> extends true
          ? Remote<T>
          : T;

/** True if T has any function-valued properties (i.e. it's a class instance, not a plain object). */
type HasMethods<T> = true extends (
  { [K in keyof T]: T[K] extends (...args: any[]) => any ? true : never }[keyof T]
) ? true : false;

/** Message sent over the central proxy channel. */
export interface ProxyMessage {
  /** Correlation ID for request/response matching */
  correlationId: string;
  /** UUID of the target proxied object */
  objectId: string;
  /** Operation type */
  op: 'get' | 'set' | 'call' | 'dispose' | 'response';
  /** Property name (for get/set) or method name (for call) */
  prop?: string;
  /** Arguments (for call) or value (for set) */
  args?: unknown[];
  /** Response value */
  value?: unknown;
  /** If the response value is non-serializable, its UUID for further proxying */
  proxyId?: string;
  /** What kind of proxy the receiver should create for proxyId */
  proxyKind?: 'function' | 'class-instance' | 'iterable' | 'object';
  /** Error message if the operation failed */
  error?: string;
  /** Channel to publish the response to (set by sender) */
  replyChannel?: string;
}
