import 'reflect-metadata';
import type { EntityOptions } from './types.js';
import type { HookRunner, HookHandler } from '../hooks/runner.js';

// ─── Metadata Keys ────────────────────────────────────────
const ENTITY_META_KEY = Symbol('entity:meta');
const HOOK_META_KEY = Symbol('entity:hooks');
const CONFIGURABLE_META_KEY = Symbol('entity:configurable');
const STATE_META_KEY = Symbol('entity:state');
const REF_META_KEY = Symbol('entity:refs');
const STREAM_META_KEY = Symbol('entity:streams');
const DESCRIBE_META_KEY = Symbol('entity:describe');

// ─── Internal metadata (EntityOptions + derived type) ─────
export interface EntityMeta extends EntityOptions {
  /** Derived from class name (PascalCase → kebab-case). e.g. TwilioPhone → twilio-phone */
  type: string;
}

function toKebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// ─── @Entity ──────────────────────────────────────────────
export function Entity(options: EntityOptions = {}): ClassDecorator {
  return function (target: Function) {
    const meta: EntityMeta = { ...options, type: toKebabCase(target.name) };
    Reflect.defineMetadata(ENTITY_META_KEY, meta, target);
  };
}


// ─── @Hook ────────────────────────────────────────────────
export interface HookMetaEntry {
  method: string;
  runnerClass: new (...args: any[]) => HookRunner<any>;
  config: Record<string, unknown>;
  inProcess: boolean;
}

export function Hook(handler: HookHandler): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) {
    const ctor = target.constructor;
    const hooks: HookMetaEntry[] = Reflect.getOwnMetadata(HOOK_META_KEY, ctor) ?? [];
    hooks.push({ method: String(propertyKey), runnerClass: handler.runnerClass, config: handler.config, inProcess: handler.inProcess ?? false });
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

// ─── @State ──────────────────────────────────────────────
export interface StateOptions {
  /** Human-readable description of what this state property holds */
  description: string;
  /** Optional Zod schema for validation (e.g. z.string().min(2).max(50)) */
  validate?: unknown;
}

export function State(options: StateOptions): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    const ctor = target.constructor;
    const fields: Map<string, StateOptions> =
      Reflect.getOwnMetadata(STATE_META_KEY, ctor) ?? new Map();
    fields.set(String(propertyKey), options);
    Reflect.defineMetadata(STATE_META_KEY, fields, ctor);
  };
}

// ─── @Describe ──────────────────────────────────────────
// Marks a method that returns a string describing the entity's current state.
// Used by LLMEntity to auto-compose the system prompt from self + refs.
// Works on any entity — not just LLMEntity.
export function Describe(): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(DESCRIBE_META_KEY, String(propertyKey), target.constructor);
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

// ─── @Stream ─────────────────────────────────────────────
// Marks a property as an EntityStream. Streams are always public —
// the parent entity can subscribe to them after boot.
export function Stream(): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    const ctor = target.constructor;
    const streams: Set<string> = Reflect.getOwnMetadata(STREAM_META_KEY, ctor) ?? new Set();
    streams.add(String(propertyKey));
    Reflect.defineMetadata(STREAM_META_KEY, streams, ctor);
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

// ─── Reflection helper for streams ────────────────────────
export function getStreamMeta(target: Function): Set<string> {
  return Reflect.getOwnMetadata(STREAM_META_KEY, target) ?? new Set();
}

// ─── Reflection Helpers ───────────────────────────────────
export function getEntityMeta(target: Function): EntityMeta | undefined {
  return Reflect.getOwnMetadata(ENTITY_META_KEY, target);
}

export function getHookMeta(target: Function): HookMetaEntry[] {
  return Reflect.getOwnMetadata(HOOK_META_KEY, target) ?? [];
}

export function getConfigurableMeta(target: Function): Map<string, ConfigurableOptions> {
  return Reflect.getOwnMetadata(CONFIGURABLE_META_KEY, target) ?? new Map();
}

export function getStateMeta(target: Function): Map<string, StateOptions> {
  return Reflect.getOwnMetadata(STATE_META_KEY, target) ?? new Map();
}

export function getDescribeMethod(target: Function): string | undefined {
  return Reflect.getOwnMetadata(DESCRIBE_META_KEY, target);
}
