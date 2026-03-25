import type { DatabaseAdapter } from '../database/adapter.js';
import type { PubSubAdapter } from '../pubsub/adapter.js';
import type { LogAdapter } from '../logger/adapter.js';

/** Options passed to @Entity decorator */
export interface EntityOptions {
  type: string;
  persona?: boolean;
  database?: new (...args: unknown[]) => DatabaseAdapter;
  pubsub?: new (...args: unknown[]) => PubSubAdapter;
  logger?: new (...args: unknown[]) => LogAdapter;
}

/** Abstract base class all entities extend */
export abstract class BaseEntity {
  /** Auto-generated, scoped to parent (e.g. person:abc123/brain:def456) */
  readonly id!: string;
}

/** Typed cross-reference to a sibling or cousin entity. Codegen validates at build time. */
export type EntityRef<T extends BaseEntity> = T;

/** Runtime entity instance metadata */
export interface EntityInstance {
  id: string;
  type: string;
  entity: BaseEntity;
  parentId?: string;
  children: Map<string, EntityInstance>;
}

/** Abstraction over entity state storage */
export interface StateStore {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
  getAll(): Record<string, unknown>;
}
