# @interactkit/sdk

A framework for building persistent, event-driven entity systems. Write plain TypeScript classes — the SDK handles state persistence, inter-entity communication, lifecycle hooks, LLM integration, and horizontal scaling.

```typescript
@Entity({ database: PrismaDatabaseAdapter })
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

- **State persistence** — entity state auto-saved/loaded via database adapters
- **Inter-entity communication** — call methods on child components like normal functions, routed transparently through an event bus
- **Lifecycle hooks** — cron, timers, init, events — just decorated methods
- **LLM-powered entities** — extend `LLMEntity`, add `@SystemPrompt`, `@Executor`, and `@Tool` with LangChain `bindTools`/`invoke` compatibility
- **Validation** — use class-validator decorators, codegen generates Zod schemas
- **Build-time checks** — codegen validates entity refs, LLM config, hook params, component wiring
- **Runtime configuration** — `@Configurable` properties with enum, validation, description support
- **Horizontal scaling** — swap `InProcessBusAdapter` for `RedisPubSubAdapter` per entity
- **Deployment planning** — CLI generates `deployment.json` showing which entities can scale independently
- **Auto-configuration** — adapters read from `node-config` or env vars, no manual wiring
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

Adapters auto-configure from `node-config` or environment variables. No manual wiring.

**`config/default.json`:**
```json
{
  "interactkit": {
    "redis": {
      "host": "127.0.0.1",
      "port": 6379
    },
    "database": {
      "url": "file:./interactkit.db"
    }
  }
}
```

**Or via environment variables:**
```bash
REDIS_HOST=127.0.0.1 REDIS_PORT=6379 DATABASE_URL=file:./interactkit.db
# or
REDIS_URL=redis://localhost:6379
```

No defaults — if you use `RedisPubSubAdapter` or `PrismaDatabaseAdapter`, config must exist or the app throws at startup.

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
@Entity({ type, persona?, database?, pubsub?, logger? })  // class
@State({ description })                                     // property — state (must be private)
@Component()                                                // property — child entity (must be private)
@Ref()                                                      // property — sibling reference (must be private)
@Tool({ description })                                      // method — public API (required on all public methods)
@Hook(Runner)                                               // method — runner determines when it fires
@Configurable({ label, group?, enum?, validation?, ... })   // property
@Secret()                                                   // property
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
| `Cron` | `Cron.Runner({ expression })` | Cron schedule |
| `Event` | `Event.Runner()` | Named events |

### Adapters

| Interface | Built-in | Config |
|-----------|----------|--------|
| `PubSubAdapter` | `InProcessBusAdapter` | None needed |
| `PubSubAdapter` | `RedisPubSubAdapter` | `interactkit.redis` or `REDIS_HOST`+`REDIS_PORT` |
| `DatabaseAdapter` | `PrismaDatabaseAdapter` | `interactkit.database` or `DATABASE_URL` |
| `LogAdapter` | `ConsoleLogAdapter` | None needed |

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
