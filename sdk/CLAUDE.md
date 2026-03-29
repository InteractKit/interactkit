# @interactkit/sdk

Framework package -- reusable, app-agnostic entity system. Zero business logic.

## Overview

The SDK has three layers: **Authoring** (what devs write), **Codegen** (pre-build analysis), and **Runtime** (execution).

```
 Authoring              Codegen                  Runtime
 ---------              -------                  -------
 @Entity                 ts-morph extracts        Event bus routes calls
 BaseEntity              types, hooks,            between entity instances
 Wrapper types      -->  methods, streams    -->  State hydration
 Hook types              Generates Zod            & persistence
 Streams                 registry + schemas       Sub-entities inherit
                                                  infra from config
```

---

## 1. Authoring -- what devs write

### Decorators

**Structural** (define what entities are and how they behave):

| Decorator | Target | Purpose |
|-----------|--------|---------|
| `@Entity({ type?, description?, persona?, detached? })` | class | Marks a class as an entity. `type` is auto-derived from class name (PascalCase to kebab-case) if omitted. `detached: true` means entity communicates via remote pubsub from config. |
| `@State({ description, validate? })` | property | Required on all state properties (must be `private`) -- describes what the state holds. Optional `validate` accepts a Zod schema for inline validation. |
| `@Component()` | property | Marks a property as a child entity component (must be `private`). Must use `Remote<T>` type -- build enforces this. |
| `@Ref()` | property | Marks a sibling reference (must be `private`). Must use `Remote<T>` type -- build enforces this. |
| `@Stream()` | property | Marks an `EntityStream<T>` property. Streams are always public -- parent entities can subscribe to them after boot |
| `@Tool({ description })` | method | Required on all public async methods -- describes what the method does |
| `@Hook(Runner)` | method | Marks a hook handler -- runner passed explicitly (e.g. `@Hook(Init.Runner())`) |
| `@Configurable({ label, group? })` | property | Marks state as UI-editable (used alongside `@State`) |
| `@Describe()` | method | Returns a string describing the entity's current state |

**LLM-specific** (only used on classes extending `LLMEntity`):

| Decorator | Target | Purpose |
|-----------|--------|---------|
| `@SystemPrompt()` | property/getter | Marks a string property or getter as the system prompt. Evaluated before each LLM invocation. |
| `@Executor()` | property | Marks the LLM executor instance (e.g. `new ChatAnthropic(...)`) |
| `@Tool({ description })` | method | Exposes a method as an LLM-callable tool (same decorator as structural) |

**Validation** -- inline Zod via the `validate` option on `@State()`, plus SDK's `@Secret()`:

| Decorator / Option | Source | Purpose |
|-----------|--------|---------|
| `Remote<T>` | `@interactkit/sdk` | Type wrapper for distributed components/refs -- makes all access async. Required on ALL `@Component`/`@Ref` properties (build enforces this). |
| `@Secret()` | `@interactkit/sdk` | Marks field as sensitive (masked in UI/logs) |
| `@State({ validate: z.string().min(2) })` | `@interactkit/sdk` | Inline Zod validation on any state property -- `z` is re-exported from the SDK |

### BaseEntity

All entities extend `BaseEntity`. The SDK hydrates state, wires components, and sets up streams. `BaseEntity` has a `protected` constructor -- entities must not define their own constructors. Use `@Hook(Init.Runner())` for initialization logic. Codegen enforces this at build time.

### LLMEntity (extends BaseEntity)

LLM-powered entities extend `LLMEntity` (from `sdk/src/llm/base.ts`) instead of `BaseEntity`. `LLMEntity` provides:

- **Built-in `invoke()` method** -- runs the LLM execution loop (prompt -> tool calls -> response). No need to declare it yourself.
- **Built-in `protected context = new LLMContext()`** -- manages conversation history. Override for custom config.
- **Built-in streams** -- `response: EntityStream<string>` and `toolCall: EntityStream<ToolCallEvent>` are pre-wired.
- **All refs/state visible to LLM by default** -- no opt-in decorator needed. Everything on the entity is visible to the LLM.
- **`@SystemPrompt()`** -- decorate a string property or getter to provide the system prompt, evaluated before each invocation.
- **`@Executor()`** -- marks the LLM executor instance.

```typescript
@Entity({ description: 'LLM-powered decision making' })
class Brain extends LLMEntity {
  @State({ description: 'Personality' })
  private personality = 'curious';

  @SystemPrompt()
  private get systemPrompt() {
    return `You are a ${this.personality} assistant.`;
  }

  @Executor()
  private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });

  @Ref() private mouth!: Remote<Mouth>;
  @Ref() private memory!: Remote<Memory>;

  @Tool({ description: 'Think deeply' })
  async think(input: { query: string }): Promise<string> { ... }
}
```

### ConversationContext (shared LLM context)

`ConversationContext` (from `sdk/src/llm/conversation.ts`) is an entity that provides opt-in shared conversation context between multiple `LLMEntity` instances. Composed as a `@Component` on a parent entity, then referenced via `@Ref` in each LLM entity that needs shared context.

```typescript
// Parent owns the shared context and multiple LLM entities
class Agent extends BaseEntity {
  @Component() private context!: Remote<ConversationContext>;
  @Component() private researchBrain!: Remote<ResearchBrain>;
  @Component() private writingBrain!: Remote<WritingBrain>;
}

// Each LLM entity overrides its built-in context with the shared one
class ResearchBrain extends LLMEntity {
  @Ref() protected override context!: Remote<ConversationContext>;
  // ... executor, tools, etc.
}

class WritingBrain extends LLMEntity {
  @Ref() protected override context!: Remote<ConversationContext>;
  // ... executor, tools, etc.
}
```

### Validation

Validation is inline via the `validate` option on `@State()`. The SDK re-exports Zod as `z`. `@Secret()` remains a separate decorator for UI masking. If no `validate` is provided, codegen auto-derives the Zod type from the TypeScript type.

```typescript
import { z, Secret } from '@interactkit/sdk';

@Entity({ type: 'user' })
class User extends BaseEntity {
  @State({ description: 'API authentication key' })
  @Secret()
  private apiKey!: string;

  @State({ description: 'User bio', validate: z.string().max(600) })
  private bio!: string;

  @State({ description: 'Account username', validate: z.string().min(3).max(50) })
  private username!: string;

  @State({ description: 'Contact email', validate: z.string().email() })
  private email!: string;

  @State({ description: 'User score', validate: z.number().min(0).max(100) })
  private score = 0;
}
```

Codegen reads the `validate` Zod schema from `@State()` + `@Secret()` metadata to generate validators for the registry. If `validate` is omitted, the Zod type is auto-derived from the TypeScript type.

### Hook namespaces

Each hook is a namespace with `.Input` (the data your method receives) and `.Runner(config)` (tells the runtime when to fire). Config goes in the Runner call.

```typescript
// Built-in (shipped with @interactkit/sdk)
Init.Input    { entityId: string; firstBoot: boolean; }      Init.Runner()                          // inProcess — use as-is
Tick.Input    { tick: number; elapsed: number; }              Tick.Runner({ intervalMs: 5000 })      // use as Remote<Tick.Input>

// Extensions (separate packages) — all non-Init inputs are used as Remote<T>
Cron.Input    { lastRun: Date; expression: string; }         Cron.Runner({ expression: '...' })     // @interactkit/cron   → Remote<Cron.Input>
HttpRequest.Input  { method, path, body, respond, ... }      HttpRequest.Runner({ path: '/' })      // @interactkit/http   → Remote<HttpRequest.Input>
WsMessage.Input    { data, clientId, send, close }           WsMessage.Runner()                     // @interactkit/websocket → Remote<WsMessage.Input>
WsConnection.Input { clientId, send, close }                 WsConnection.Runner()                  // @interactkit/websocket → Remote<WsConnection.Input>
```

Hook types are not hardcoded -- extension packages export their own namespaces with `.Input` + `.Runner(config)`. The runner is explicit in `@Hook(Runner)`, so no codegen type-tracing is needed. This enables recursive package usage.

### EntityRef\<T\>

Typed cross-reference to a sibling or cousin entity. Parent sets the ref -- codegen validates at build time that the referenced type exists in the same entity tree. Runtime auto-wires during instantiation.

```typescript
class Person extends BaseEntity {
  @Component() private brain!: Remote<Brain>;
  @Component() private phone!: Remote<Phone>;
}

class Brain extends BaseEntity {
  @Ref() private phone!: Remote<Phone>;  // must be private -- codegen validates

  @Tool({ description: 'Handle a query' })
  async handleQuery(text: string) {
    await this.phone.speak("thinking...");  // same this.x.method() pattern
  }
}
```

**Build-time validation:** codegen walks the component tree and confirms the ref target is reachable from `Brain`'s parent. Both components and refs must be `private` -- codegen enforces this to prevent multi-hop chaining (e.g. `this.brain.memory.recall()` is not possible). If validation fails, build fails.

**Runtime wiring:** parent owns both children, so it auto-wires the ref during instantiation. No manual assignment.

### EntityStream\<T\>

Typed upstream data flow from child to parent. Has `start/data/end` lifecycle. `emit(data)` is a convenience shortcut for start+data+end. Streams MUST be ended (runtime warns).

Streams are marked with `@Stream()` and are **always public** -- the parent entity can subscribe to child streams via the component proxy (e.g. `this.mouth.transcript.on('data', ...)`). The runtime auto-wires stream access on the component proxy after boot.

```typescript
// Child entity defines a stream
class Mouth extends BaseEntity {
  @Stream() transcript!: EntityStream<string>;

  @Tool({ description: 'Speak a message' })
  async speak(input: { message: string }): Promise<void> {
    this.transcript.emit(input.message);
  }
}

// Parent subscribes to child stream
class Agent extends BaseEntity {
  @Component() private mouth!: Remote<Mouth>;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    this.mouth.transcript.on('data', (text: unknown) => {
      // handle transcript data
    });
  }
}
```

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

## 2. Codegen -- pre-build analysis (ts-morph)

`cli/src/codegen/parser/index.ts` reads decorated entity source files and generates `.interactkit/generated/type-registry.ts`.

**What it extracts:**

| Source | Output |
|--------|--------|
| `@Entity` metadata | type (auto-derived from class name PascalCase to kebab-case if omitted), persona flag |
| Primitive/wrapper-typed properties | State -- Zod validators |
| Entity-typed properties | Components -- proxy wrappers for event bus |
| `@Stream()` or `EntityStream<T>` properties | Streams (always public) |
| `@Ref()` properties | Cross-entity refs -- build-time validated against component tree |
| `@Hook(Runner)` methods | Hook dispatch table (runner + input type from decorator) |
| `@Configurable()` properties | UI schema (label, group, type, validation) |
| Public async methods (non-hook) | Auto-named `entityType.methodName` events |
| Method param/return types | Event input/result Zod schemas |
| `@State({ validate })` + `@Secret()` | Zod validators + fieldMeta (`@Secret()` -> `secret: true`, `validate: z.string().max(600)` -> `.max(600)`) |
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

## 3. Infrastructure -- configured in interactkit.config.ts

All infrastructure is configured globally in `interactkit.config.ts` at the project root. No per-entity infrastructure config.

```typescript
// interactkit.config.ts
import { Agent } from './src/entities/agent.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { RedisPubSubAdapter } from '@interactkit/redis';
import { DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';

export default {
  root: Agent,
  database: new PrismaDatabaseAdapter({ url: 'file:./app.db' }),
  pubsub: new RedisPubSubAdapter({ host: 'localhost', port: 6379 }),
  observer: new DevObserver(),
  timeout: 15_000,       // event bus request timeout (default: 30000)
  stateFlushMs: 50,      // state persistence debounce (default: 10)
} satisfies InteractKitConfig;
```

```typescript
@Entity({ persona: true })
class Person extends BaseEntity {
  @Component() private brain!: Remote<Brain>;   // local -- same process
  @Component() private phone!: Remote<Phone>;   // detached -- can run on another machine
}

@Entity()  // local, co-located with parent
class Brain extends BaseEntity { }

@Entity({ detached: true })  // communicates via remote pubsub from config
class Phone extends BaseEntity { }
```

### Detached entities

Entities marked `detached: true` communicate via the remote pubsub adapter configured in `interactkit.config.ts`. Non-detached entities use `InProcessBusAdapter` (local, zero-latency). Database is global (from config).

| Adapter | Latency | Scaling | Use case |
|---------|---------|---------|----------|
| `InProcessBusAdapter` | ~0ms | Single process | Default for all non-detached entities |
| `RedisPubSubAdapter` | ~1-5ms | Horizontal | Detached entities -- cross-instance communication |
| `PrismaDatabaseAdapter` | ~5-20ms | Horizontal | Durable state persistence (global, via config) |

### Adapter interfaces

`PubSubAdapter` is an abstract base class with two subclass families:
- **`LocalPubSubAdapter`** -- passes values by reference, no serialization, no proxy. `InProcessBusAdapter` extends this.
- **`RemotePubSubAdapter`** -- JSON serialization + automatic proxy for non-serializable values. `RedisPubSubAdapter` extends this. Non-serializable values (functions, class instances) are automatically proxied across machines. `FinalizationRegistry` cleans up proxies when garbage collected. `ProxyReceiver` handles get/set/call/dispose operations.

```typescript
abstract class PubSubAdapter {
  abstract publish(channel: string, message: string): Promise<void>;
  abstract subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  abstract unsubscribe(channel: string): Promise<void>;
}

interface DatabaseAdapter {
  get(entityId: string): Promise<Record<string, unknown> | null>;
  set(entityId: string, state: Record<string, unknown>): Promise<void>;
  delete(entityId: string): Promise<void>;
}

interface ObserverAdapter {
  event(envelope: EventEnvelope): void;   // every serialized event flowing through the bus
  error(envelope: EventEnvelope, error: Error): void;  // failed events
  on(event: string, handler: (...args: unknown[]) => void): void;   // subscribe to observer events
  off(event: string, handler: (...args: unknown[]) => void): void;  // unsubscribe
}
```

---

## 4. Runtime

| Module | Responsibility |
|--------|---------------|
| `entity/runner/` | Entity instantiation, state hydration from DB, component wiring, ref wiring (second pass after all instances exist), stream setup |
| `entity/proxy/` | Transparent proxy system for `RemotePubSubAdapter`. `ProxyReceiver` handles get/set/call/dispose operations. `FinalizationRegistry` cleans up proxies when GC'd. |
| `entity/wrappers/` | `Remote<T>` type definition -- makes all method calls return `Promise<...>` and property access `Promise<T>` |
| `events/bus.ts` | PubSub adapter-based event bus (request/response pattern) |
| `events/dispatcher.ts` | Routes events to entity instances by ID, validates payloads via generated registry |

---

## 5. Extensions -- hook packages

The SDK is open by design. External packages export hook namespaces (`.Input` + `.Runner(config)`). Users attach them to their own entities with `@Hook`. No plugin registry, no config files.

Extension packages live in `extensions/` in the monorepo. Each is published independently to npm under `@interactkit/*`. They declare `@interactkit/sdk` as a **peerDependency**.

### Extension packages

| Package | What it provides |
|---------|-----------------|
| `@interactkit/redis` | `RedisPubSubAdapter` -- horizontal scaling via Redis |
| `@interactkit/prisma` | `PrismaDatabaseAdapter` -- Prisma-backed state persistence |
| `@interactkit/cron` | `Cron` hook -- cron scheduling via node-cron |
| `@interactkit/http` | `HttpRequest` hook -- HTTP server |
| `@interactkit/websocket` | `WsMessage`, `WsConnection` hooks -- WebSocket server |

### Example -- using `@interactkit/http`

```typescript
import { HttpRequest } from '@interactkit/http';

@Entity({ description: 'Webhook receiver' })
class Webhook extends BaseEntity {
  @State({ description: 'Received payloads' })
  private payloads: string[] = [];

  @Hook(HttpRequest.Runner({ port: 3100, path: '/webhook' }))
  async onRequest(input: Remote<HttpRequest.Input>) {
    this.payloads.push(input.body);
    input.respond(200, JSON.stringify({ ok: true }));
  }

  @Tool({ description: 'Get received payloads' })
  async getPayloads(): Promise<string[]> { return this.payloads; }
}
```

### Writing an extension

A package exports a **namespace** containing `.Input` (interface) and `.Runner(config)` (factory):

```typescript
import type { HookRunner, HookHandler } from '@interactkit/sdk';

export namespace MyHook {
  export interface Input { data: string; }

  class RunnerImpl implements HookRunner<Input> {
    async init(config: Record<string, unknown>) {
      // set up shared resources (server, connection) using config from interactkit.config.ts
    }
    register(emit: (data: Input) => void, config: Record<string, unknown>) {
      // add emit callback with per-entity run config
    }
    async stop() { /* tear down */ }
  }

  export function Runner(config: { /* per-entity run config */ }): HookHandler<Input> {
    return {
      __hookHandler: true, runnerClass: RunnerImpl,
      config: config as any,
      initConfig: { /* defaults, overridable via interactkit.config.ts hooks */ },
    };
  }
}
```

### What this means for codegen

- **Codegen follows imports into node_modules** -- ts-morph resolves types across packages. When it sees `phone: TwilioPhone`, it finds the `@Entity` decorator and extracts hooks/methods/state.
- **Hook types are not hardcoded** -- codegen treats any interface used as a `@Hook(Runner)` parameter as a valid hook type.
- **Runner is explicit** -- the `@Hook` decorator receives the runner directly. No scanning node_modules for `HookRunner<T>` implementations. This is simpler and enables recursive package usage.
- **No special extension API** -- the extension model is just TypeScript imports + namespaces.

### HookRunner interface

```typescript
interface HookRunner<T> {
  init(config: Record<string, unknown>): Promise<void>;
  register(emit: (data: T) => void, config: Record<string, unknown>): void;
  stop(): Promise<void>;
}

interface HookHandler<T = any> {
  readonly __hookHandler: true;
  readonly runnerClass: new (...args: any[]) => HookRunner<T>;
  readonly config: Record<string, unknown>;        // per-entity run config
  readonly initConfig?: Record<string, unknown>;   // defaults, merged with interactkit.config.ts hooks
  readonly inProcess?: boolean;
}
```

- `init(config)` -- set up shared resources. Config = defaults from `initConfig` merged with overrides from `interactkit.config.ts` `hooks` field.
- `register(emit, config)` -- add an emit callback per entity. Config = per-entity run config from `@Hook(Runner(config))` + runtime additions (entityId).
- `stop()` -- tear down resources.
- **Local hooks** (`inProcess: true`): init + register + stop all in the entity process.
- **Remote hooks** (`inProcess: false`): `_hooks.ts` process calls init, then listens for register events from entity processes via pubsub.

---

## Design rules

1. **Events are internal** -- devs call `this.component.method(input)`, codegen compiles it to event bus calls. No event names/envelopes exposed.
2. **Zod only in `@State({ validate })`** -- devs write plain TS types for method params/returns (codegen generates Zod for those). Inline Zod is only used in the `validate` option on `@State()` for explicit validation constraints.
3. **Only `@Tool` methods and `@Stream` properties are public** -- state, components, and refs must be `private`. Streams are always public (parent subscribes to child streams). Only `@Tool`-decorated async methods can be public. This enforces encapsulation and single-hop communication (no `this.brain.memory.recall()`).
4. **State requires `@State({ description })`** -- every state property must have `@State({ description: '...' })` and be `private`. This ensures all state is documented and discoverable.
5. **All public methods require `@Tool`** -- every public async method must have `@Tool({ description: '...' })`. Hook methods are exempt.
6. **Validation via inline Zod** -- `@State({ validate: z.string().min(2) })` for inline validation, plus SDK's `@Secret()` for UI masking. If `validate` is omitted, codegen auto-derives the Zod type from the TypeScript type.
7. **Entity IDs are auto-generated** -- runtime assigns unique IDs on instantiation. Sub-entity IDs are scoped to their parent (e.g. `person:abc123/brain:def456`). Devs never manage IDs manually.
8. **Errors propagate upward naturally** -- when `this.brain.think()` throws, the caller gets the error just like a normal function call. Devs use standard try/catch. The event bus serializes errors back through the same request/response path.
9. **Entity set is static** -- all entity instances are defined at build time. No dynamic spawning at runtime.
10. **No custom constructors** -- `BaseEntity` has a `protected` constructor. Entities must not define their own constructors -- codegen enforces this at build time. Use `@Hook(Init.Runner())` for initialization logic.
11. **Entity type auto-derived** -- when `type` is not specified in `@Entity()`, codegen derives it from the class name (PascalCase to kebab-case, e.g. `ResearchBrain` becomes `research-brain`).
12. **LLM entities extend `LLMEntity`, not `BaseEntity`** -- `LLMEntity` provides `invoke()`, built-in context, built-in streams, and automatic LLM visibility. No `@LLMEntity()` decorator, no `@LLMVisible()`, no `@LLMExecutionTrigger()`, no `@Context()` needed.
13. **`Remote<T>` on all components and refs** -- the build enforces that every `@Component` and `@Ref` property uses `Remote<T>`. The mutator strips this at compile time so `design:type` metadata stays correct.

---

## File structure

```
src/
  index.ts                   # Barrel export
  entity/
    decorators/              # @Entity, @Hook, @Configurable, etc.
    wrappers/                # Remote<T> type, proxy wrappers
    proxy/                   # Transparent proxy system (ProxyReceiver, get/set/call/dispose ops)
    runner/                  # Entity runner -- instantiation, ref wiring (second pass), state hydration
    context/                 # Entity context management
    infra/                   # Infrastructure resolution (adapter inheritance)
    stream/                  # EntityStream<T> implementation (in-process + Redis)
  llm/
    base.ts                  # LLMEntity class (extends BaseEntity) -- invoke(), built-in context/streams
    conversation.ts          # ConversationContext entity -- shared context between LLM entities
    decorators.ts            # @SystemPrompt(), @Executor()
  hooks/
    init.ts                  # Init namespace (Input + Runner)
    tick.ts                  # Tick namespace (Input + Runner)
    runner.ts                # HookRunner<T> + HookHandler<T> interfaces
  settings.ts                # InteractKitConfig type
  events/
    bus.ts                   # PubSub adapter-based event bus
    dispatcher.ts            # Event routing + validation
    types.ts                 # EventEnvelope
  pubsub/
    adapter.ts               # PubSubAdapter abstract base, LocalPubSubAdapter, RemotePubSubAdapter
    in-process.ts            # InProcessBusAdapter (extends LocalPubSubAdapter) -- zero-latency, single process
  database/
    adapter.ts               # DatabaseAdapter interface
  observer/
    adapter.ts               # ObserverAdapter interface
    base.ts                  # BaseObserver -- abstract base with event emitter
    console.ts               # ConsoleObserver -- default stdout
    dev.ts                   # DevObserver -- colored dev-mode output
```

## Dependencies

**Runtime (bundled):**

| Package | Role |
|---------|------|
| `zod` | Runtime validation (generated code, re-exported as `z`) |
| `@langchain/core` | LLM integration (BaseChatModel, bindTools, invoke) |
| `@modelcontextprotocol/sdk` | MCP client for tool discovery |

**Peer dependencies (users install alongside SDK):**

| Package | Role |
|---------|------|
| `reflect-metadata` | Decorator metadata -- must be loaded before any entity code |

## Build

```bash
interactkit build                                  # codegen + tsc + boot -> .interactkit/ (reads root from config)
interactkit build --root=src/entities/agent:Agent  # override root entity from CLI
interactkit start                                  # run the built app
interactkit dev                                    # build + run + watch for changes (auto-restarts)
pnpm build                                         # tsc only (no codegen)
```
