# @interactkit/sdk

A framework for building persistent, event-driven entity systems. Write plain TypeScript classes — the SDK handles state persistence, inter-entity communication, lifecycle hooks, LLM integration, and horizontal scaling.

```typescript
@LLMEntity()
@Entity({ type: 'agent', database: PrismaDatabaseAdapter })
class Agent extends BaseEntity {
  @Component() brain!: Brain;
  @Component() phone!: Phone;

  @Context() context = new LLMContext();
  @Executor() llm = new ChatOpenAI({ model: 'gpt-4' });  // any LangChain BaseChatModel

  @LLMTool({ description: 'Search memory for relevant info' })
  async search(input: { query: string }) { return this.brain.recall(input); }

  @LLMExecutionTrigger()  // body replaced by LLM loop: message → tools → response
  async chat(params: LLMExecutionTriggerParams): Promise<string> { return ''; }
}

const ctx = await boot(Agent);
```

## What it does

- **State persistence** — entity state auto-saved/loaded via database adapters
- **Inter-entity communication** — call methods on child components like normal functions, routed transparently through an event bus
- **Lifecycle hooks** — cron, timers, init, events — just decorated methods
- **LLM-powered entities** — `@LLMEntity`, `@LLMTool`, `@LLMExecutionTrigger` with LangChain `bindTools`/`invoke` compatibility
- **Validation** — use class-validator decorators, codegen generates Zod schemas
- **Build-time checks** — codegen validates entity refs, LLM config, hook params, component wiring
- **Runtime configuration** — `@Configurable` properties with enum, validation, description support
- **Horizontal scaling** — swap `InProcessBusAdapter` for `RedisPubSubAdapter` per entity
- **Deployment planning** — CLI generates `deployment.json` showing which entities can scale independently
- **Auto-configuration** — adapters read from `node-config` or env vars, no manual wiring
- **Extensible** — external packages provide custom hook types, runners, and entities via standard imports

## Install

```bash
pnpm add @interactkit/sdk
pnpm add -D @interactkit/cli
```

## CLI

```bash
interactkit build    # codegen + tsc → .interactkit/build/ + deployment.json
interactkit dev      # build + watch mode
interactkit start    # run the built app
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
@Component()                                                // property — child entity
@Ref()                                                      // property — sibling reference
@Hook()                                                     // method
@Configurable({ label, group?, enum?, validation?, ... })   // property
@Secret()                                                   // property
```

### LLM decorators

```typescript
@LLMEntity()                                    // class — marks as LLM-powered
@Context()                                      // property — LLMContext instance
@Executor()                                     // property — LangChain BaseChatModel (bindTools/invoke)
@LLMTool({ description, name? })                // method — exposed as LLM tool
@LLMExecutionTrigger()                          // method — body replaced with LLM execution loop
@LLMVisible()                                   // property — visible to LLM as context
```

### Property types

| Type | Role |
|------|------|
| `string`, `number`, etc. | State (persisted) |
| Entity class (`@Component`) | Component (child, proxied via event bus) |
| Entity class (`@Ref`) | Sibling reference (proxied via event bus) |
| `EntityStream<T>` | Child-to-parent data stream |
| `LLMContext` (`@Context`) | LLM conversation state |

### Hook types

| Type | Trigger |
|------|---------|
| `InitInput` | Once on boot |
| `TickInput<{ intervalMs }>` | Fixed interval |
| `CronInput<{ expression }>` | Cron schedule |
| `EventInput<T>` | Named events |
| `WebSocketInput<{ port }>` | WebSocket connections (extension) |
| `HttpInput<{ port, path }>` | HTTP requests (extension) |

### Adapters

| Interface | Built-in | Config |
|-----------|----------|--------|
| `PubSubAdapter` | `InProcessBusAdapter` | None needed |
| `PubSubAdapter` | `RedisPubSubAdapter` | `interactkit.redis` or `REDIS_HOST`+`REDIS_PORT` |
| `DatabaseAdapter` | `PrismaDatabaseAdapter` | `interactkit.database` or `DATABASE_URL` |
| `LogAdapter` | `ConsoleLogAdapter` | None needed |

### Build-time validation

The codegen catches at build time:
- Unknown component entity types
- `@Ref` targets not reachable as siblings
- `@Hook` methods without typed parameters
- `@LLMEntity` missing `@Executor` or `@Context`
- `@LLMExecutionTrigger` without tools
- `@LLMTool` without description or not public async
- Orphaned LLM decorators without `@LLMEntity`
