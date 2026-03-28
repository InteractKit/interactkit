/**
 * Determine if a value can be serialized to JSON (sent over pubsub as-is).
 * Non-serializable values need to be wrapped in a remote proxy.
 */
export function isSerializable(value: unknown): boolean {
  if (value === null || value === undefined) return true;

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type === 'bigint' || type === 'symbol' || type === 'function') return false;

  if (value instanceof Date) return true;
  if (value instanceof RegExp) return false;
  if (value instanceof Map || value instanceof Set || value instanceof WeakMap || value instanceof WeakSet) return false;
  if (value instanceof Error) return false;
  if (value instanceof Promise) return false;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return false;

  if (Array.isArray(value)) return value.every(isSerializable);

  // Plain object — check all values recursively
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    return Object.values(value as Record<string, unknown>).every(isSerializable);
  }

  // Class instance (has custom prototype) — not serializable
  return false;
}

/** Classify what kind of proxy we need for a non-serializable value. */
export type ProxyKind = 'function' | 'class-instance' | 'iterable' | 'object';

export function classifyForProxy(value: unknown): ProxyKind {
  if (typeof value === 'function') return 'function';
  if (value !== null && typeof value === 'object') {
    if (Symbol.iterator in value || Symbol.asyncIterator in value) return 'iterable';
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return 'class-instance';
  }
  return 'object';
}
