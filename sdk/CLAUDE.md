# @interactkit/sdk

Framework package — reusable, app-agnostic entity system. Zero business logic.

## Overview

The SDK has three layers: **Authoring** (what devs write), **Codegen** (pre-build analysis), and **Runtime** (execution). No separate bootstrap step — the root entity's `@Entity` decorator carries infrastructure config.

```
 Authoring              Codegen                  Runtime
 ─────────              ───────                  ───────
 @Entity (root has       ts-morph extracts        Event bus routes calls
   database + pubsub)    types, hooks,            between entity instances
 BaseEntity              methods, streams         State hydration
 Wrapper types      ──►  Generates Zod       ──►  & persistence
 Hook types              registry + schemas       Sub-entities inherit
 Streams                                          infra from root
```

---

## 1. Authoring — what devs write

### Decorators

**Structural** (define what entities are and how they behave):

| Decorator | Target | Purpose |
|-----------|--------|---------|
| `@Entity({ type, persona?, database?, pubsub?, logger? })` | class | Marks a class as an entity. Root entities optionally pass infra config; sub-entities inherit from parent. |
| `@Component()` | property | Marks a property as a child entity component (triggers type metadata emission) |
| `@Hook()` | method | Marks a hook handler (hook type inferred from param type) |
| `@Configurable({ label, group? })` | property | Marks state as UI-editable |

**Validation** — uses `class-validator` (full library available) plus SDK's `@Secret()`:

| Decorator | Source | Purpose |
|-----------|--------|---------|
| `@Secret()` | `@interactkit/sdk` | Marks field as sensitive (masked in UI/logs) |
| `@MaxLength()`, `@MinLength()`, `@IsEmail()`, `@Min()`, `@Max()`, etc. | `class-validator` | Standard validation — any class-validator decorator works |

### BaseEntity

All entities extend `BaseEntity`. The SDK hydrates state, wires components, and sets up streams.

### Validation decorators

Uses `class-validator` (same lib as NestJS DTOs) for all standard validation. The SDK only adds `@Secret()` for marking sensitive fields.

```typescript
import { MaxLength, MinLength, IsEmail, Min, Max } from 'class-validator';
import { Secret } from '@interactkit/sdk';

@Entity({ type: 'user' })
class User extends BaseEntity {
  @Secret()
  apiKey: string;

  @MaxLength(600)
  bio: string;

  @MinLength(3) @MaxLength(50)
  username: string;

  @IsEmail()
  email: string;

  @Min(0) @Max(100)
  score: number;
}
```

Codegen reads class-validator metadata + `@Secret()` metadata to generate Zod validators for the registry. Any class-validator decorator works — the full library is available.

### Hook input types

Generic params encode compile-time config (cron expressions, intervals). Runtime values come from entity state. The SDK ships these built-in hook types, but **hook types are not hardcoded** — any interface used as a `@Hook()` parameter is a valid hook type (see Extensions).

```typescript
// Built-in (shipped with @interactkit/sdk)
interface CronInput<P extends { expression: string }>                    { lastRun: Date; }
interface EventInput<T = unknown>                                        { eventName: string; payload: T; source: string; }
interface InitInput                                                       { entityId: string; firstBoot: boolean; }
interface TickInput<P extends { intervalMs: number } = { intervalMs: 60000 }> { tick: number; elapsed: number; }
interface WebSocketInput<P extends { port: number; host?: string }>       { data: unknown; connectionId: string; }
interface HttpInput<P extends { port: number; path?: string; method?: string }> { body: unknown; headers: Record<string, string>; params: Record<string, string>; }
```

### EntityRef\<T\>

Typed cross-reference to a sibling or cousin entity. Parent sets the ref — codegen validates at build time that the referenced type exists in the same entity tree. Runtime auto-wires during instantiation.

```typescript
class Person extends BaseEntity {
  brain: Brain;
  phone: Phone;
}

class Brain extends BaseEntity {
  phone: EntityRef<Phone>;  // sibling ref — codegen validates Phone exists under same parent

  async handleQuery(text: string) {
    await this.phone.speak("thinking...");  // same this.x.method() pattern
  }
}
```

**Build-time validation:** codegen walks the component tree and confirms `EntityRef<Phone>` is reachable from `Brain`'s parent. If not, build fails.

**Runtime wiring:** parent owns both children, so it auto-wires the ref during instantiation. No manual assignment.

### EntityStream\<T\>

Typed upstream data flow from child → parent. Has `start/data/end` lifecycle. `emit(data)` is a convenience shortcut for start+data+end. Streams MUST be ended (runtime warns).

```typescript
interface EntityStream<T> {
  start(): void;
  data(payload: T): void;
  end(): void;
  emit(payload: T): void;  // start + data + end in one call
  on(event: 'start' | 'data' | 'end', handler: Function): void;
}
```

---

## 2. Codegen — pre-build analysis (ts-morph)

`src/codegen/extract.ts` reads decorated entity source files and generates `__generated__/type-registry.ts`.

**What it extracts:**

| Source | Output |
|--------|--------|
| `@Entity` metadata | type, persona flag |
| Primitive/wrapper-typed properties | State — Zod validators |
| Entity-typed properties | Components — proxy wrappers for event bus |
| `EntityStream<T>` properties | Streams |
| `EntityRef<T>` properties | Cross-entity refs — build-time validated against component tree |
| `@Hook()` methods | Hook dispatch table (incl. generic params) |
| `@Configurable()` properties | UI schema (label, group, type, validation) |
| Public async methods (non-hook) | Auto-named `entityType.methodName` events |
| Method param/return types | Event input/result Zod schemas |
| Validation decorators (`@Secret`, `@MaxLength`, etc.) | Zod validators + fieldMeta (`@Secret()` → `secret: true`, `@MaxLength(600)` → `.max(600)`) |
| Union literals, optionals, arrays, nested objects | `z.enum()`, `.optional()`, `z.array()`, `z.object()` |

**Generated output:**

```typescript
export const Registry = {
  entities: {
    [entityType: string]: {
      state: ZodObject,
      persona: boolean,
      methods: {
        [entityType.methodName: string]: {
          input: ZodObject,
          result: ZodObject,
          fieldMeta: Record<string, { secret?, maxLength?, ... }>,
        }
      },
      components: string[],
    }
  }
}

export const ConfigurableFields = {
  [entityType]: Array<{ key, label, group, type, validation }>
}

export type EntityType = keyof typeof Registry.entities;
export type MethodName = ...;
```

---

## 3. Infrastructure — configured on @Entity

Root entities carry optional `database`, `pubsub`, `logger`, and `runners` params. Sub-entities inherit from their parent by default, but can override with their own adapters.

```typescript
@Entity({
  type: 'person',
  persona: true,
  database: PrismaClient,       // slow, scalable — shared state store
  pubsub: RedisPubSubAdapter,   // slow, scalable — horizontal scaling across instances
  logger: ConsoleLogAdapter,    // sees all serialized events + errors automatically
})
class Person extends BaseEntity {
  brain: Brain;   // inherits Person's DB + pubsub + logger by default
  phone: Phone;   // same
}

@Entity({ type: 'brain' })
class Brain extends BaseEntity {
  // inherits parent's infra — no override needed
}

@Entity({
  type: 'phone',
  pubsub: InProcessBusAdapter,  // override — fast, in-process for real-time voice
})
class Phone extends BaseEntity {
  // uses Person's database (inherited) but its own fast pubsub (overridden)
}
```

### Per-entity infra overrides

Any sub-entity can override `database` or `pubsub` independently. This lets you mix transports based on latency requirements:

| Adapter | Latency | Scaling | Use case |
|---------|---------|---------|----------|
| `InProcessBusAdapter` | ~0ms | Single process | Real-time voice, hot loops |
| `RedisPubSubAdapter` | ~1-5ms | Horizontal | Cross-instance entity communication |
| `PrismaClient` | ~5-20ms | Horizontal | Durable state persistence |

The runtime resolves infra per entity: check own `@Entity` params first, then walk up the parent chain. This means you get **fast paths where you need them** (voice) and **scalable paths everywhere else** (state sync, config) — without the entity code knowing the difference.

### Adapter interfaces

```typescript
interface PubSubAdapter {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
}

interface DatabaseAdapter {
  get(entityId: string): Promise<Record<string, unknown> | null>;
  set(entityId: string, state: Record<string, unknown>): Promise<void>;
  delete(entityId: string): Promise<void>;
}

interface LogAdapter {
  event(envelope: EventEnvelope): void;   // every serialized event flowing through the bus
  error(envelope: EventEnvelope, error: Error): void;  // failed events
}
```

---

## 4. Runtime

| Module | Responsibility |
|--------|---------------|
| `entity/runtime.ts` | Entity instantiation, state hydration from DB, component wiring, stream setup |
| `events/bus.ts` | PubSub adapter-based event bus (request/response pattern) |
| `events/dispatcher.ts` | Routes events to entity instances by ID, validates payloads via generated registry |

---

## 5. Extensions — external packages provide entities + hooks

The SDK is open by design. External packages can provide entities, custom hook types, and hook runners. Users consume them via standard TypeScript imports — no plugin registry, no config files, no manual runner registration.

### Convention

A package that exports a custom hook input type **must also export its runner from the same package**. The runner implements `HookRunner<T>` where `T` is the hook input type — codegen reads the generic param to map hook types to runners automatically. No naming convention required.

### Example

```typescript
// ─── @interactkit/twilio (external package) ───────────────

// Custom hook type — same pattern as built-in CronInput, TickInput, etc.
export interface SmsInput<P extends { phoneNumber: string }> {
  from: string;
  body: string;
}

// Runner — MUST be exported from the same package as SmsInput
// Generic param tells codegen this runner handles SmsInput hooks
export class SmsRunner implements HookRunner<SmsInput> {
  async start(emit: (data: SmsInput<any>) => void, config: { phoneNumber: string }) {
    // spins up Twilio webhook listener
    // on incoming SMS: emit({ from: '+1...', body: 'hello' })
  }
  async stop() { ... }
}

// Entity with custom hooks + methods
@Entity({ type: 'twilio-phone' })
export class TwilioPhone extends BaseEntity {
  @Configurable({ label: 'Phone Number' })
  phoneNumber: string;

  @Hook()
  async onSms(input: SmsInput<{ phoneNumber: '+1234567890' }>) { ... }

  async call(input: { to: string }) { ... }
  async sendSms(input: { to: string; body: string }) { ... }
}
```

```typescript
// ─── Your app — just import and use ──────────────────────

import { TwilioPhone } from '@interactkit/twilio';

@Entity({ type: 'person' })
class Person extends BaseEntity {
  phone: TwilioPhone;   // codegen follows the import, extracts everything
  brain: Brain;
}
// No runner registration needed — runtime auto-imports SmsRunner from @interactkit/twilio
```

### What this means for codegen

- **Codegen follows imports into node_modules** — ts-morph resolves types across packages. When it sees `phone: TwilioPhone`, it finds the `@Entity` decorator and extracts hooks/methods/state.
- **Hook types are not hardcoded** — codegen treats any interface used as a `@Hook()` parameter as a valid hook type. Built-in types from `@interactkit/sdk` have built-in runners. External types are recorded with their source package + type name in the generated registry.
- **Runtime auto-imports runners** — for each external hook type in the registry, codegen also scans the source package for classes implementing `HookRunner<ThatHookType>` and records the runner export name + package. Runtime auto-imports it.
- **No special extension API** — the extension model is just TypeScript imports. `HookRunner<T>` generic param is the mapping.

### HookRunner interface

```typescript
interface HookRunner<T> {
  start(emit: (data: T) => void, config: Record<string, unknown>): Promise<void>;
  stop(): Promise<void>;
}
```

- `T` — the hook input type. Codegen reads the generic param to build the hook type → runner mapping.
- `emit` — provided by the runtime. Runner calls it when external data arrives, runtime routes it to the entity's `@Hook` method.
- Runner knows nothing about entities — it just listens for external events and emits typed data.

### Custom validation decorators

Validation is extensible via class-validator's built-in custom decorator support — no SDK-specific extension mechanism needed. See class-validator docs for creating custom validators.

---

## Design rules

1. **Events are internal** — devs call `this.component.method(input)`, codegen compiles it to event bus calls. No event names/envelopes exposed.
2. **No Zod in entity files** — devs write plain TS types. Codegen generates Zod.
3. **Property roles inferred from types** — no `@State`, `@Component`, `@Stream`, `@Ref` decorators. Primitives = state, entity-typed = component, `EntityStream<T>` = stream, `EntityRef<T>` = cross-entity ref.
4. **Validation via class-validator** — standard decorators (`@MaxLength`, `@IsEmail`, etc.) plus SDK's `@Secret()`. Codegen reads metadata to generate Zod.
5. **Entity IDs are auto-generated** — runtime assigns unique IDs on instantiation. Sub-entity IDs are scoped to their parent (e.g. `person:abc123/brain:def456`). Devs never manage IDs manually.
6. **Errors propagate upward naturally** — when `this.brain.think()` throws, the caller gets the error just like a normal function call. Devs use standard try/catch. The event bus serializes errors back through the same request/response path.
7. **Entity set is static** — all entity instances are defined at build time. No dynamic spawning at runtime.

---

## File structure

```
src/
  index.ts                   # Barrel export
  entity/
    decorators.ts            # @Entity, @Hook, @Configurable
    validators.ts            # @Secret() — domain-specific; all other validation from class-validator
    runtime.ts               # Instantiation, state persistence, event routing
    stream.ts                # EntityStream<T> implementation
    types.ts                 # BaseEntity, EntityInstance, StateStore
  hooks/
    types.ts                 # CronInput, EventInput, InitInput, TickInput, WebSocketInput, HttpInput
    runner.ts                # HookRunner<T> interface — implemented by built-in + external hook runners
  events/
    bus.ts                   # PubSub adapter-based event bus
    dispatcher.ts            # Event routing + validation
    types.ts                 # EventEnvelope
  pubsub/
    adapter.ts               # PubSubAdapter interface
    redis.ts                 # RedisPubSubAdapter (ioredis) — horizontal scaling
    in-process.ts            # InProcessBusAdapter — zero-latency, single process
  database/
    adapter.ts               # DatabaseAdapter interface
    prisma.ts                # Prisma-backed implementation
  logger/
    adapter.ts               # LogAdapter interface
    console.ts               # ConsoleLogAdapter — default stdout
  codegen/
    extract.ts               # ts-morph entry point
    type-mapper.ts           # TS type → Zod conversion
    validator-mapper.ts      # Reads class-validator metadata → Zod code
```

## Dependencies

| Package | Role |
|---------|------|
| `class-validator` | Validation decorators (same as NestJS DTOs) |
| `zod` | Runtime validation (generated code) |
| `@prisma/client` | Entity state persistence |
| `ioredis` | Redis pub/sub adapter |
| `reflect-metadata` | Decorator metadata |
| `ts-morph` (dev) | AST analysis for codegen |
| `prisma` (dev) | Schema generation |

## Build

```bash
pnpm codegen  # reads app/src → generates app/src/__generated__/
pnpm build    # tsc
```
