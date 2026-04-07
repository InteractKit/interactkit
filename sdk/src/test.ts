/**
 * Test helper — create a test app with in-memory DB and optional mocks.
 *
 * Usage:
 *   import { createTestApp } from '@interactkit/sdk/test';
 *
 *   const app = await createTestApp(graph, {
 *     handlers: { Worker: { process: async (e, i) => 'mocked' } },
 *   });
 *
 *   const result = await app.worker.process({ data: 'test' });
 *   expect(result).toBe('mocked');
 *
 *   await app.stop();
 */

import type { InteractKitRuntime, InteractKitApp, HandlerMap } from './runtime.js';

// ─── Types ──────────────────────────────────────────────

export interface TestAppConfig {
  /** Handler overrides (merged with any src-defined handlers) */
  handlers?: HandlerMap;
  /** Initial state overrides keyed by entity path */
  state?: Record<string, Record<string, unknown>>;
}

// ─── In-memory database ─────────────────────────────────

export function createMemoryDb() {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store,
    adapter: {
      async get(id: string) { return store.get(id) ?? null; },
      async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
      async delete(id: string) { store.delete(id); },
    },
  };
}

// ─── Test app factory ───────────────────────────────────

/**
 * Create a test app from a graph instance.
 *
 * ```ts
 * import { graph } from '../interactkit/.generated/graph.js';
 * import { createTestApp } from '@interactkit/sdk/test';
 *
 * const app = await createTestApp(graph, {
 *   handlers: { Worker: { process: async (e, i) => 'mocked' } },
 * });
 * ```
 */
export async function createTestApp(
  graphOrRuntime: InteractKitRuntime | { configure: Function },
  config?: TestAppConfig,
): Promise<InteractKitApp & { db: ReturnType<typeof createMemoryDb> }> {
  const { store, adapter } = createMemoryDb();
  const db = { store, adapter };

  // Pre-seed state if provided
  if (config?.state) {
    for (const [path, state] of Object.entries(config.state)) {
      store.set(path, { ...state });
    }
  }

  const app = (graphOrRuntime as any).configure({
    database: adapter,
    handlers: config?.handlers,
  });

  await app.boot();

  // Attach db for inspection in tests
  return Object.assign(app, { db });
}

// ─── Assertions ─────────────────────────────────────────

/** Assert a value equals expected, throw with message if not */
export function assertEq<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Assert a value is truthy */
export function assert(value: unknown, msg?: string): asserts value {
  if (!value) {
    throw new Error(msg ?? `Assertion failed: ${value}`);
  }
}
