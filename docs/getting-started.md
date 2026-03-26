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
    brain.ts       ← LLM entity (sees Memory via @Ref)
    memory.ts      ← stores and retrieves information
  config/
    default.json   ← Redis and database config
  .env             ← OPENAI_API_KEY and other secrets
  package.json
  tsconfig.json
```

`dotenv` is included by default -- put your `OPENAI_API_KEY` in `.env` and it's available immediately.

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

Add an MCP server as an entity:

```bash
interactkit add Slack --mcp-stdio "npx -y @slack/mcp-server"
interactkit add GitHub --mcp-stdio "npx -y @github/mcp-server" \
  --mcp-env "GITHUB_TOKEN=$GITHUB_TOKEN"
```

This generates an entity file with the MCP transport pre-configured. Use `--mcp-header` for auth headers and `--mcp-env` for environment variables. See [Extensions](./extensions.md#mcp-servers-as-entities) for full details.

### CLI Commands

| Command | What it does |
|---------|-------------|
| `interactkit init <name>` | Create a new project |
| `interactkit add <name>` | Generate an entity file |
| `interactkit add <name> --llm` | Generate an LLM entity |
| `interactkit add <name> --mcp-stdio "cmd"` | Generate an MCP entity (stdio transport) |
| `interactkit add <name> --attach Parent` | Generate and attach as `@Component` to Parent |
| `interactkit build --root=path:Export` | Build everything |
| `interactkit dev --root=path:Export` | Build + watch for changes |
| `interactkit start` | Run your app |

---

## How It Works

1. You write entity classes with `@Describe()` and `@Tool` methods
2. You write one `LLMEntity` -- all its refs and components are visible to the LLM by default
3. InteractKit auto-generates tool schemas from your TypeScript types
4. When you call `brain.invoke({ message: "..." })`, the LLM sees all available tools, calls them as needed, and returns a final answer

---

## Your First Entity

An entity is a class that does one thing. It has `@Tool` methods. That's its API.

```typescript
import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity()
class Memory extends BaseEntity {
  @Describe()
  describe() {
    return 'Stores and retrieves text entries for later use.';
  }

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
- `@Describe()` provides a description of what the entity does (required on all entities)
- `@State()` marks a property to be saved to the database automatically
- `@Tool()` exposes a method that other entities (or an LLM) can call

## Composing Entities

Entities can contain other entities. The parent lists them as `@Component()`:

```typescript
@Entity()
class Agent extends BaseEntity {
  @Describe()
  describe() {
    return 'Top-level agent that orchestrates brain, memory, and browser.';
  }

  @Component() private brain!: Brain;
  @Component() private memory!: Memory;
  @Component() private browser!: Browser;
}
```

Children can talk to siblings using `@Ref()`:

```typescript
@Entity()
class Brain extends BaseEntity {
  @Describe()
  describe() {
    return 'Coordinates memory lookups and actions.';
  }

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
  @Describe()
  describe() {
    return 'Root agent with persistent storage.';
  }

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
