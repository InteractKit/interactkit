import type { BaseEntity } from '../entity/types.js';

/**
 * A hook runner is a typed event source.
 * T is the hook input type this runner handles.
 * Codegen reads the generic param via ts-morph to map hook types → runners.
 *
 * - start: begin listening, call emit(data) when external data arrives
 * - stop: tear down
 */
export interface HookRunner<T> {
  start(emit: (data: T) => void, config: Record<string, unknown>): Promise<void>;
  stop(): Promise<void>;
}
