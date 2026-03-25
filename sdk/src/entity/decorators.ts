import 'reflect-metadata';
import type { EntityOptions } from './types.js';

// ─── Metadata Keys ────────────────────────────────────────
const ENTITY_META_KEY = Symbol('entity:meta');
const HOOK_META_KEY = Symbol('entity:hooks');
const CONFIGURABLE_META_KEY = Symbol('entity:configurable');
const REF_META_KEY = Symbol('entity:refs');

// ─── @Entity ──────────────────────────────────────────────
export function Entity(options: EntityOptions): ClassDecorator {
  return function (target: Function) {
    Reflect.defineMetadata(ENTITY_META_KEY, options, target);
  };
}

// ─── @Hook ────────────────────────────────────────────────
export function Hook(): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) {
    const ctor = target.constructor;
    const hooks: string[] = Reflect.getOwnMetadata(HOOK_META_KEY, ctor) ?? [];
    hooks.push(String(propertyKey));
    Reflect.defineMetadata(HOOK_META_KEY, hooks, ctor);
  };
}

// ─── @Configurable ────────────────────────────────────────
export interface ConfigurableOptions {
  label: string;
  group?: string;
  description?: string;
  /** Restrict to a set of allowed values — renders as dropdown in UI */
  enum?: readonly string[] | readonly number[];
  /** Custom Zod schema for validation (e.g. z.string().url()) */
  validation?: unknown;
  /** Default value shown in UI */
  defaultValue?: unknown;
  /** Hide from UI but still configurable via API */
  hidden?: boolean;
  /** Make read-only in UI */
  readOnly?: boolean;
}

export function Configurable(options: ConfigurableOptions): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    const ctor = target.constructor;
    const fields: Map<string, ConfigurableOptions> =
      Reflect.getOwnMetadata(CONFIGURABLE_META_KEY, ctor) ?? new Map();
    fields.set(String(propertyKey), options);
    Reflect.defineMetadata(CONFIGURABLE_META_KEY, fields, ctor);
  };
}

// ─── @Component ───────────────────────────────────────────
// Marks a property as a child entity component.
// Triggers TypeScript's design:type metadata emission
// so the runtime can discover the entity class at boot time.
export function Component(): PropertyDecorator {
  return function (_target: object, _propertyKey: string | symbol) {
    // no-op — metadata emission is the side effect
  };
}

// ─── @Ref ─────────────────────────────────────────────────
// Marks a property as a sibling entity reference (EntityRef<T>).
// Triggers TypeScript's design:type metadata emission and stores ref metadata.
export function Ref(): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    const ctor = target.constructor;
    const refs: Set<string> = Reflect.getOwnMetadata(REF_META_KEY, ctor) ?? new Set();
    refs.add(String(propertyKey));
    Reflect.defineMetadata(REF_META_KEY, refs, ctor);
  };
}

// ─── Reflection helper for refs ───────────────────────────
export function getRefMeta(target: Function): Set<string> {
  return Reflect.getOwnMetadata(REF_META_KEY, target) ?? new Set();
}

// ─── Reflection Helpers ───────────────────────────────────
export function getEntityMeta(target: Function): EntityOptions | undefined {
  return Reflect.getOwnMetadata(ENTITY_META_KEY, target);
}

export function getHookMeta(target: Function): string[] {
  return Reflect.getOwnMetadata(HOOK_META_KEY, target) ?? [];
}

export function getConfigurableMeta(target: Function): Map<string, ConfigurableOptions> {
  return Reflect.getOwnMetadata(CONFIGURABLE_META_KEY, target) ?? new Map();
}
