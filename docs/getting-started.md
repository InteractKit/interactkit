# Getting Started

## Installation

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

## Your first entity

An entity is a class decorated with `@Entity` that extends `BaseEntity`:

```typescript
import { Entity, BaseEntity, Hook, Configurable, InitInput } from '@interactkit/sdk';

@Entity({ type: 'greeter' })
class Greeter extends BaseEntity {
  @Configurable({ label: 'Greeting Message' })
  message = 'Hello';

  @Hook()
  async onInit(input: InitInput) {
    console.log(`${this.message} from ${this.id}!`);
  }

  async greet(input: { name: string }): Promise<string> {
    return `${this.message}, ${input.name}!`;
  }
}
```

## Booting the system

```typescript
import { boot } from '@interactkit/sdk';

const ctx = await boot(Greeter);
// Logs: "Hello from greeter:a1b2c3!"

// Call methods on the root entity directly
const result = await ctx.root.greet({ name: 'World' });
console.log(result); // "Hello, World!"

// Shutdown when done
await ctx.shutdown();
```

## Parent + child entities

Entities compose via typed properties. The SDK auto-discovers children and wires them:

```typescript
import { Entity, BaseEntity, Hook, Component, InitInput } from '@interactkit/sdk';

@Entity({ type: 'brain' })
class Brain extends BaseEntity {
  async think(input: { query: string }): Promise<string> {
    return `Thinking about: ${input.query}`;
  }
}

@Entity({ type: 'person' })
class Person extends BaseEntity {
  @Component() brain!: Brain;

  @Hook()
  async onInit(input: InitInput) {
    const thought = await this.brain.think({ query: 'existence' });
    console.log(thought);
  }
}

const ctx = await boot(Person);
// Logs: "Thinking about: existence"
```

`this.brain.think()` looks like a normal method call, but under the hood it serializes through the event bus — making it transparent whether Brain runs in-process or across machines.

## Adding persistence

Pass infrastructure config on the root entity:

```typescript
import { PrismaDatabaseAdapter, ConsoleLogAdapter } from '@interactkit/sdk';

@Entity({
  type: 'person',
  database: PrismaDatabaseAdapter,
  logger: ConsoleLogAdapter,
})
class Person extends BaseEntity {
  @Component() brain!: Brain;  // inherits database + logger automatically
}
```

## Configuration

Adapters auto-configure from `node-config` or env vars:

**`config/default.json`:**
```json
{
  "interactkit": {
    "redis": { "host": "127.0.0.1", "port": 6379 },
    "database": { "url": "file:./interactkit.db" }
  }
}
```

No defaults — if you use `RedisPubSubAdapter` or `PrismaDatabaseAdapter` without config, the app throws at startup.

## Next steps

- [Entities](./entities.md) — decorators, components, refs, streams
- [Hooks](./hooks.md) — lifecycle hooks, cron, tick, custom hooks
- [LLM Entities](./llm.md) — AI-powered entities with LangChain
- [Infrastructure](./infrastructure.md) — adapters, per-entity overrides, config
- [Deployment](./deployment.md) — deployment planning, scaling
- [Codegen](./codegen.md) — CLI, generated registry, build-time validation
- [Extensions](./extensions.md) — building custom hook types and runners
