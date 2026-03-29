/** Options passed to @Entity decorator */
export interface EntityOptions {
  /** Human-readable description of what this entity does */
  description?: string;
  /** Mark this entity as detached — communicates via remote pubsub from config */
  detached?: boolean;
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
