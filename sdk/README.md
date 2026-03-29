# @interactkit/sdk

The core framework for InteractKit. Write plain TypeScript classes -- the SDK handles state persistence, inter-entity communication, lifecycle hooks, LLM integration, transparent distributed proxying, and horizontal scaling.

```typescript
import { Entity, LLMEntity, Component, SystemPrompt, Executor, Tool, type Remote } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity({ description: 'Root agent' })
class Agent extends LLMEntity {
  @Component() private memory!: Remote<Memory>;

  @SystemPrompt()
  private get systemPrompt() { return 'You are a helpful agent.'; }

  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });

  @Tool({ description: 'Search memory for relevant info' })
  async search(input: { query: string }) { return this.memory.search(input); }
}

// interactkit build
// interactkit start
```

## What it does

- **State persistence** -- `@State` properties auto-save to the database, restore on restart, sync between replicas
- **Transparent distribution** -- call methods on entities across machines like normal functions. `Remote<T>` gives compile-time type safety. Functions and objects returned from remote calls become live proxies.
- **Lifecycle hooks** -- init, timers, and extension hooks (cron, HTTP, websocket) via decorated methods
- **LLM-powered entities** -- extend `LLMEntity`, add `@SystemPrompt`, `@Executor`, and `@Tool` with LangChain `bindTools`/`invoke` compatibility
- **Validation** -- inline Zod schemas via `@State({ validate })`, codegen reads them directly
- **Build-time checks** -- codegen validates entity refs, LLM config, hook params, component wiring, `Remote<T>` enforcement
- **Runtime configuration** -- `@Configurable` properties with enum, validation, description support
- **Horizontal scaling** -- mark entities `detached: true` to use remote pubsub from config
- **Explicit configuration** -- adapters take connection config via constructors in `interactkit.config.ts`
- **Extensible** -- external packages provide custom hook types, runners, and entities via standard imports

## Quick start

```bash
interactkit init my-agent
cd my-agent && pnpm install
interactkit dev
```

## CLI

```bash
interactkit init <name>                                        # scaffold a new project
interactkit add <name> [--llm] [--detached] [--attach Parent]  # generate entity file
interactkit build                                              # codegen + tsc + boot (reads root from config)
interactkit build --root=src/path:ExportName                   # override root entity from CLI
interactkit dev                                                # build + watch mode
interactkit start                                              # run the built app
```

## Configuration

All infrastructure is configured in `interactkit.config.ts` at the project root. The `root` field specifies the root entity class, making `--root` optional on the CLI:

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
  timeout: 15_000,      // event bus request timeout (default: 30000)
  stateFlushMs: 50,     // state persistence debounce (default: 10)
} satisfies InteractKitConfig;
```

## Documentation

Full docs at **[docs.interactkit.dev](https://docs.interactkit.dev)**

| Guide | Description |
|-------|-------------|
| [Getting Started](https://docs.interactkit.dev/#/getting-started) | First entity, boot, parent-child composition, config |
| [Entities](https://docs.interactkit.dev/#/entities) | Decorators, components, refs, streams, validation |
| [Hooks](https://docs.interactkit.dev/#/hooks) | Init, tick, and extension hooks |
| [LLM Entities](https://docs.interactkit.dev/#/llm) | AI-powered entities with LangChain, tools, execution triggers |
| [Infrastructure](https://docs.interactkit.dev/#/infrastructure) | Database, pubsub, observer adapters, config |
| [Deployment](https://docs.interactkit.dev/#/deployment) | Deployment planning, scaling, co-location rules |
| [Extensions](https://docs.interactkit.dev/#/extensions) | Building custom hook types, runners, and extension packages |

## Quick reference

### Structural decorators

```typescript
@Entity({ type?, description?, persona?, detached? })                // class
@State({ description })                                              // property (must be private)
@Component()                                                         // property (must be private, use Remote<T>)
@Ref()                                                               // property (must be private, use Remote<T>)
@Tool({ description })                                               // method (public async)
@Hook(Runner)                                                        // method
@Configurable({ label, group?, enum?, validation?, ... })            // property
@Secret()                                                            // property
@Stream()                                                            // property (EntityStream<T>)
@Describe()                                                          // method
Remote<T>                                                            // type -- async proxy for distributed components/refs
```

### LLM decorators

Used on classes extending `LLMEntity` (which extends `BaseEntity`):

```typescript
@SystemPrompt()                                 // property/getter -- system prompt
@Executor()                                     // property -- LangChain BaseChatModel
@Tool({ description })                          // method -- LLM-callable tool
```

### Built-in hooks

| Namespace | Runner config | Trigger |
|-----------|--------------|---------|
| `Init` | `Init.Runner()` | Once on boot |
| `Tick` | `Tick.Runner({ intervalMs })` | Fixed interval |

### Extension hooks

| Package | Namespace | Runner config |
|---------|-----------|--------------|
| `@interactkit/cron` | `Cron` | `Cron.Runner({ expression: '...' })` |
| `@interactkit/http` | `HttpRequest` | `HttpRequest.Runner({ path: '/' })` |
| `@interactkit/websocket` | `WsMessage`, `WsConnection` | `WsMessage.Runner()` |

### Adapters shipped with SDK

| Adapter | Type | Notes |
|---------|------|-------|
| `InProcessBusAdapter` | Local pub/sub | Default, zero-latency, pass by reference |
| `BaseObserver` | Observer base class | Extend for custom observers |
| `ConsoleObserver` | Observer | Plain stdout/stderr |
| `DevObserver` | Observer | Colored dev-mode output |
| `RemotePubSubAdapter` | Remote pub/sub base | Extend for custom remote adapters |

### Adapter interfaces

| Interface | Purpose |
|-----------|---------|
| `DatabaseAdapter` | State persistence (get/set/delete) |
| `PubSubAdapter` | Message transport base class |
| `LocalPubSubAdapter` | In-process pub/sub base |
| `ObserverAdapter` | Event observability |

### Extension adapters

| Package | Adapter | Constructor config |
|---------|---------|-------------------|
| `@interactkit/redis` | `RedisPubSubAdapter` | `{ host, port }` or `{ url }` |
| `@interactkit/prisma` | `PrismaDatabaseAdapter` | `{ url }` |

### Extension ecosystem

| Package | What it provides |
|---------|-----------------|
| `@interactkit/redis` | `RedisPubSubAdapter` -- horizontal scaling via Redis |
| `@interactkit/prisma` | `PrismaDatabaseAdapter` -- Prisma-backed state persistence |
| `@interactkit/cron` | `Cron` hook -- cron scheduling via node-cron |
| `@interactkit/http` | `HttpRequest` hook -- HTTP server |
| `@interactkit/websocket` | `WsMessage`, `WsConnection` hooks -- WebSocket server |

### Build-time validation

The codegen catches at build time:
- State property missing `@State` or not `private`
- Stream property not `private`
- Component/ref property not `private`
- Public async method missing `@Tool`
- Unknown component entity types
- `@Ref` targets not reachable as siblings
- `LLMEntity` subclass missing `@Executor`
- `@Tool` without description or not public async
- Orphaned LLM decorators without `extends LLMEntity`
- All `@Component`/`@Ref` missing `Remote<T>` (build enforces this on every component and ref)
- Remote `@Hook` input missing `Remote<T>`
