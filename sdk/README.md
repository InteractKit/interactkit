# @interactkit/sdk

The core framework for InteractKit. Write plain TypeScript classes — the SDK handles state persistence, inter-entity communication, lifecycle hooks, LLM integration, transparent distributed proxying, and horizontal scaling.

```typescript
@Entity({ description: 'Root agent' })
class Agent extends LLMEntity {
  @Component() private brain!: Brain;
  @Component() private phone!: Phone;

  @SystemPrompt()
  private get systemPrompt() { return 'You are a helpful agent.'; }

  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4' });  // any LangChain BaseChatModel

  @Tool({ description: 'Search memory for relevant info' })
  async search(input: { query: string }) { return this.brain.recall(input); }
}

// interactkit build --root=src/agent:Agent
// interactkit start
// Call agent.invoke({ message: 'find something' }) to trigger the LLM loop
```

## What it does

- **State persistence** — `@State` properties auto-save to the database, restore on restart, sync between replicas
- **Transparent distribution** — call methods on entities across machines like normal functions. `Remote<T>` gives you compile-time type safety. Functions and objects returned from remote calls become live proxies.
- **Lifecycle hooks** — init, timers, cron, HTTP webhooks, custom events — just decorated methods
- **LLM-powered entities** — extend `LLMEntity`, add `@SystemPrompt`, `@Executor`, and `@Tool` with LangChain `bindTools`/`invoke` compatibility
- **Validation** — inline Zod schemas via `@State({ validate })`, codegen reads them directly
- **Build-time checks** — codegen validates entity refs, LLM config, hook params, component wiring
- **Runtime configuration** — `@Configurable` properties with enum, validation, description support
- **Horizontal scaling** — swap `InProcessBusAdapter` for `RedisPubSubAdapter` per entity
- **Deployment planning** — CLI generates `deployment.json` showing which entities can scale independently
- **Explicit configuration** — adapters take connection config via constructors in `interactkit.config.ts`
- **Extensible** — external packages provide custom hook types, runners, and entities via standard imports

## Quick start

```bash
interactkit init my-agent
cd my-agent && pnpm install
interactkit build --root=src/entities/agent:Agent
interactkit start
```

## CLI

```bash
interactkit init <name>                                        # scaffold a new project
interactkit add <entity|llm|component> <Name>                  # generate entity file
interactkit build --root=src/path:ExportName                   # codegen + tsc + boot
interactkit dev --root=src/path:ExportName                     # build + watch mode
interactkit start                                              # run the built app
```

## Configuration

All infrastructure is configured in `interactkit.config.ts` at the project root. Adapters take connection config via their constructors:

```typescript
// interactkit.config.ts
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { RedisPubSubAdapter } from '@interactkit/redis';
import { DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';

export default {
  database: new PrismaDatabaseAdapter({ url: 'file:./app.db' }),
  pubsub: new RedisPubSubAdapter({ host: 'localhost', port: 6379 }),
  observer: new DevObserver(),
  timeout: 15_000,      // event bus request timeout (default: 30000)
  stateFlushMs: 50,     // state persistence debounce (default: 10)
} satisfies InteractKitConfig;
```

No defaults -- if you use `RedisPubSubAdapter` or `PrismaDatabaseAdapter`, config must exist or the app throws at startup.

## Deployment planning

`interactkit build` generates `.interactkit/generated/deployment.json`:

```json
{
  "units": [
    {
      "name": "unit-agent",
      "entities": ["agent", "brain", "mouth", "sensor"],
      "reason": "InProcessBusAdapter requires co-location",
      "scalable": false
    },
    {
      "name": "unit-memory",
      "entities": ["memory"],
      "scalable": true,
      "busAdapter": "RedisPubSubAdapter"
    }
  ],
  "connections": [
    { "from": "unit-agent", "to": "unit-memory", "adapter": "RedisPubSubAdapter" }
  ]
}
```

Entities using `InProcessBusAdapter` or `EntityStream` are grouped (must share a process). Entities with `RedisPubSubAdapter` can be deployed and scaled independently.

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](../docs/getting-started.md) | First entity, boot, parent-child composition, config |
| [Entities](../docs/entities.md) | Decorators, components, refs, streams, validation |
| [Hooks](../docs/hooks.md) | Init, tick, cron, event hooks and custom hook types |
| [LLM Entities](../docs/llm.md) | AI-powered entities with LangChain, tools, execution triggers |
| [Infrastructure](../docs/infrastructure.md) | Database, pubsub, logger adapters, config, per-entity overrides |
| [Deployment](../docs/deployment.md) | Deployment planning, scaling, co-location rules |
| [Codegen](../docs/codegen.md) | CLI, generated registry, build-time validation |
| [Extensions](../docs/extensions.md) | Building custom hook types, runners, and extension packages |

## Quick reference

### Structural decorators

```typescript
@Entity({ type, persona?, detached? })                       // class
@State({ description })                                     // property — state (must be private)
@Component()                                                // property — child entity (must be private)
@Ref()                                                      // property — sibling reference (must be private)
@Tool({ description })                                      // method — public API (required on all public methods)
@Hook(Runner)                                               // method — runner determines when it fires
@Configurable({ label, group?, enum?, validation?, ... })   // property
@Secret()                                                   // property
Remote<T>                                                   // type — async proxy wrapper for distributed components/refs
```

### LLM decorators

Used on classes extending `LLMEntity` (which extends `BaseEntity`):

```typescript
@SystemPrompt()                                 // property/getter — system prompt (evaluated before each invocation)
@Executor()                                     // property — LangChain BaseChatModel (bindTools/invoke)
@Tool({ description })                          // method — LLM-callable tool (same decorator as structural)
```

### Property types

| Type | Role |
|------|------|
| `string`, `number`, etc. | State (persisted) |
| Entity class (`@Component`) | Component (child, proxied via event bus) |
| Entity class (`@Ref`) | Sibling reference (proxied via event bus) |
| `EntityStream<T>` | Child-to-parent data stream |

### Hook namespaces

| Namespace | Runner config | Trigger |
|-----------|--------------|---------|
| `Init` | `Init.Runner()` | Once on boot |
| `Tick` | `Tick.Runner({ intervalMs })` | Fixed interval |

### Adapters

| Adapter | Type | Constructor config |
|---------|------|--------------------|
| `InProcessBusAdapter` | Local (pass by reference) | None needed |
| `RedisPubSubAdapter` | Remote (auto-proxy for functions/objects) | `{ host: string, port: number }` or `{ url: string }` |
| `PrismaDatabaseAdapter` | Database | `{ url: string }` |
| `ConsoleObserver` | Observer | None needed |

Local adapters pass values by reference -- functions and class instances work natively. Remote adapters serialize to JSON and automatically proxy non-serializable values across machines.

### Build-time validation

The codegen catches at build time:
- State property missing `@State` or not `private`
- Stream property not `private`
- Component/ref property not `private`
- Public async method missing `@Tool`
- Unknown component entity types
- `@Ref` targets not reachable as siblings
- `@Hook` methods without typed parameters
- `LLMEntity` subclass missing `@Executor`
- `@Tool` without description or not public async
- Orphaned LLM decorators without `extends LLMEntity`
- Distributed `@Component`/`@Ref` missing `Remote<T>`
- Remote `@Hook` input missing `Remote<T>`
