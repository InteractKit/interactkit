import type { DatabaseAdapter } from '../database/adapter.js';
import type { PubSubAdapter } from '../pubsub/adapter.js';
import type { LogAdapter } from '../logger/adapter.js';

/** Options passed to @Entity decorator */
export interface EntityOptions {
  /** Human-readable description of what this entity does */
  description?: string;
  /** Database adapter class — root entities only, sub-entities inherit */
  database?: new (...args: unknown[]) => DatabaseAdapter;
  /** PubSub adapter class — root entities or per-entity override */
  pubsub?: new (...args: unknown[]) => PubSubAdapter;
  /** Logger adapter class — root entities only, sub-entities inherit */
  logger?: new (...args: unknown[]) => LogAdapter;
}

/** Abstract base class all entities extend */
export abstract class BaseEntity {
  /** Auto-generated, scoped to parent (e.g. person:abc123/brain:def456) */
  readonly id!: string;

  /** @internal — constructor is framework-managed. Entities must not define their own constructor. */
  protected constructor() {}
}

/** @internal Runtime-only constructor type — bypasses protected visibility for framework instantiation */
export type EntityConstructor = new (...args: any[]) => BaseEntity;

/** Public-facing type for boot() — accepts classes with protected constructors */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityClass = { prototype: BaseEntity } & Function;

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
