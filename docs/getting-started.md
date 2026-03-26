# Getting Started

## Create a Project

```bash
interactkit init my-agent
cd my-agent
pnpm install
```

This gives you a working project with three entities:

```
my-agent/
  src/entities/
    agent.ts       ← root entity (has Brain and Memory as components)
    brain.ts       ← LLM entity (sees Memory via @LLMVisible)
    memory.ts      ← stores and retrieves information
  config/
    default.json   ← Redis and database config
  package.json
  tsconfig.json
```

## Build and Run

```bash
pnpm run build     # or: interactkit build --root=src/entities/agent:Agent
pnpm run start     # or: interactkit start
```

`--root` points to your top-level entity. Use `pnpm run dev` to auto-rebuild on file changes.

## Add More Entities

```bash
interactkit add Browser --attach Agent         # creates browser.ts, adds @Component to Agent
interactkit add Brain --llm --attach Agent      # creates an LLM entity, attaches it
```

Use dots for nesting:

```bash
interactkit add researcher.Browser             # creates src/entities/researcher/browser.ts
interactkit add researcher.ResearchBrain --llm  # creates src/entities/researcher/research-brain.ts
```

### CLI Commands

| Command | What it does |
|---------|-------------|
| `interactkit init <name>` | Create a new project |
| `interactkit add <name>` | Generate an entity file |
| `interactkit add <name> --llm` | Generate an LLM entity |
| `interactkit add <name> --attach Parent` | Generate and attach as `@Component` to Parent |
| `interactkit build --root=path:Export` | Build everything |
| `interactkit dev --root=path:Export` | Build + watch for changes |
| `interactkit start` | Run your app |

---

## How It Works

1. You write entity classes with `@Tool` methods
2. You write one `@LLMEntity` that marks siblings/children as `@LLMVisible()`
3. InteractKit auto-generates tool schemas from your TypeScript types
4. When you call `brain.chat({ message: "..." })`, the LLM sees all visible tools, calls them as needed, and returns a final answer

---

## Your First Entity

An entity is a class that does one thing. It has `@Tool` methods. That's its API.

```typescript
import { Entity, BaseEntity, State, Tool } from '@interactkit/sdk';

@Entity()
class Memory extends BaseEntity {
  @State({ description: 'Stored entries' })
  private entries: string[] = [];

  @Tool({ description: 'Store something for later' })
  async store(input: { text: string }): Promise<void> {
    this.entries.push(input.text);
  }

  @Tool({ description: 'Search stored entries' })
  async search(input: { query: string }): Promise<string[]> {
    return this.entries.filter(e => e.includes(input.query));
  }
}
```

- `@Entity()` registers the class
- `@State()` marks a property to be saved to the database automatically
- `@Tool()` exposes a method that other entities (or an LLM) can call

## Composing Entities

Entities can contain other entities. The parent lists them as `@Component()`:

```typescript
@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private memory!: Memory;
  @Component() private browser!: Browser;
}
```

Children can talk to siblings using `@Ref()`:

```typescript
@Entity()
class Brain extends BaseEntity {
  @Ref() private memory!: Memory;    // sibling reference

  @Tool({ description: 'Remember something' })
  async remember(input: { text: string }) {
    await this.memory.store({ text: input.text });
  }
}
```

Method calls between entities go through an event bus behind the scenes, so they work the same whether entities run in one process or across machines.

## Project Structure

For small projects, keep entities flat:

```
src/entities/
  agent.ts
  brain.ts
  memory.ts
  browser.ts
```

As your project grows, group entities by sub-agent. If an entity only exists inside another entity, put it in that entity's folder:

```
src/entities/
  agent.ts                    ← root
  brain.ts                    ← top-level Brain
  researcher/
    researcher.ts             ← sub-agent
    research-brain.ts         ← Researcher's own Brain
    browser.ts                ← Researcher's own Browser
  writer/
    writer.ts                 ← sub-agent
    writer-brain.ts
    templates.ts
  shared/
    memory.ts                 ← used by multiple sub-agents
```

The rule: **if it belongs to one parent, put it in that parent's folder. If it's reused, put it in `shared/` or at the top level.**

The build doesn't care about folder layout. `--root` follows imports wherever they go.

## Adding a Database

Want state to survive restarts? Add a database adapter to your root entity:

```typescript
@Entity({
  database: PrismaDatabaseAdapter,
  logger: ConsoleLogAdapter,
})
class Agent extends BaseEntity {
  @Component() private brain!: Brain;   // inherits database + logger
  @Component() private memory!: Memory; // inherits database + logger
}
```

Children inherit adapters automatically.

## Config

Adapters read from `config/default.json`:

```json
{
  "interactkit": {
    "redis": { "host": "127.0.0.1", "port": 6379 },
    "database": { "url": "file:./interactkit.db" }
  }
}
```

---

## What's Next?

- [Entities](./entities.md): all the building blocks in detail
- [LLM Entities](./llm.md): give an entity an LLM brain
- [Hooks](./hooks.md): timers, cron jobs, events
- [Infrastructure](./infrastructure.md): database, pub/sub, logging
