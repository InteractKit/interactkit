# Getting Started

## Create a Project

```bash
npm i -g @interactkit/cli
interactkit init my-agent
```

This gives you a working project:

```
my-agent/
  src/entities/
    agent.ts              <- root entity (has Brain and Memory as components)
    brain.ts              <- LLM entity (sees Memory via @Ref)
    memory.ts             <- stores and retrieves information
  interactkit.config.ts   <- database, pubsub, and observer config
  package.json
  tsconfig.json
```

## Build and Run

```bash
pnpm run build     # or: interactkit build
pnpm run start     # or: interactkit start
```

The root entity is read from `interactkit.config.ts` (the `root` field). Use `pnpm run dev` to auto-rebuild on file changes. You can override the root from the CLI with `--root=src/path:ExportName`.

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

This generates an entity file with the MCP transport pre-configured. See [Extensions](./extensions.md#mcp-servers-as-entities) for full details.

### CLI Commands

| Command | What it does |
|---------|-------------|
| `interactkit init <name>` | Create a new project |
| `interactkit add <name>` | Generate an entity file |
| `interactkit add <name> --llm` | Generate an LLM entity |
| `interactkit add <name> --detached` | Generate a detached entity (uses remote pubsub from config) |
| `interactkit add <name> --mcp-stdio "cmd"` | Generate an MCP entity (stdio transport) |
| `interactkit add <name> --attach Parent` | Generate and attach as `@Component` to Parent |
| `interactkit attach <Child> <Parent>` | Attach existing entity as `@Component` (auto-infers `Remote<T>`) |
| `interactkit attach <Child> <Parent> --ref` | Attach as `@Ref` instead of `@Component` |
| `interactkit build` | Build everything (reads root from config) |
| `interactkit build --root=path:Export` | Build with a root override |
| `interactkit dev` | Build + watch for changes |
| `interactkit start` | Run your app |

---

## How It Works

1. You write entity classes with `@Describe()` and `@Tool` methods
2. You write one `LLMEntity` -- all its refs' and components' tools are visible to the LLM by default
3. InteractKit auto-generates tool schemas from your TypeScript types
4. Every LLMEntity runs a **thinking loop** -- a continuous inner monologue. `brain.invoke({ message: "..." })` pushes a task to the loop. The LLM thinks, uses tools, and calls `respond()` to return the answer
5. Between tasks the LLM can think autonomously, manage its own memory, and sleep to save tokens

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

Entities can contain other entities. The parent lists them as `@Component()`. All components and refs require `Remote<T>` -- the build enforces this:

```typescript
import { Entity, BaseEntity, Describe, Component, type Remote } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Describe()
  describe() {
    return 'Top-level agent that orchestrates brain, memory, and browser.';
  }

  @Component() private brain!: Remote<Brain>;
  @Component() private memory!: Remote<Memory>;
  @Component() private browser!: Remote<Browser>;
}
```

Children can talk to siblings using `@Ref()`:

```typescript
import { Entity, BaseEntity, Describe, Ref, Tool, type Remote } from '@interactkit/sdk';

@Entity()
class Brain extends BaseEntity {
  @Describe()
  describe() {
    return 'Coordinates memory lookups and actions.';
  }

  @Ref() private memory!: Remote<Memory>;    // sibling reference

  @Tool({ description: 'Remember something' })
  async remember(input: { text: string }) {
    await this.memory.store({ text: input.text });
  }
}
```

Method calls between entities go through an event bus behind the scenes, so they work the same whether entities run in one process or across machines.

When multiple LLM brains need to share the same conversation history, use `ConversationContext` as a shared `@Component` and reference it from each brain with `@Ref`. See [Shared Conversation Context](./llm.md#shared-conversation-context).

## Project Structure

For small projects, keep entities flat:

```
src/entities/
  agent.ts
  brain.ts
  memory.ts
  browser.ts
```

As your project grows, group entities by sub-agent:

```
src/entities/
  agent.ts                    <- root
  brain.ts                    <- top-level Brain
  researcher/
    researcher.ts             <- sub-agent
    research-brain.ts         <- Researcher's own Brain
    browser.ts                <- Researcher's own Browser
  writer/
    writer.ts                 <- sub-agent
    writer-brain.ts
    templates.ts
  shared/
    memory.ts                 <- used by multiple sub-agents
```

The rule: **if it belongs to one parent, put it in that parent's folder. If it's reused, put it in `shared/` or at the top level.**

The build doesn't care about folder layout. `--root` follows imports wherever they go.

## Adding a Database

Want state to survive restarts? Configure a database adapter in `interactkit.config.ts`:

```typescript
// interactkit.config.ts
import { Agent } from './src/entities/agent.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import type { InteractKitConfig } from '@interactkit/sdk';

export default {
  root: Agent,
  database: new PrismaDatabaseAdapter({ url: 'file:./app.db' }),
} satisfies InteractKitConfig;
```

All entities share this database automatically -- no per-entity configuration needed.

## Config

All infrastructure is configured in `interactkit.config.ts` at the project root. The `root` field specifies the root entity class (making `--root` optional on the CLI). Adapters take connection config via their constructors:

```typescript
// interactkit.config.ts
import { Agent } from './src/entities/agent.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { RedisPubSubAdapter } from '@interactkit/redis';
import { DashboardObserver } from '@interactkit/observer';
import { DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';

export default {
  root: Agent,
  database: new PrismaDatabaseAdapter({ url: 'file:./app.db' }),
  pubsub: new RedisPubSubAdapter({ host: 'localhost', port: 6379 }),
  observers: [new DevObserver(), new DashboardObserver()],
  timeout: 15_000,      // event bus request timeout (default: 30000)
  stateFlushMs: 50,     // state persistence debounce (default: 10)
} satisfies InteractKitConfig;
```

---

## What's Next?

- [Entities](./entities.md): all the building blocks in detail
- [LLM Entities](./llm.md): give an entity an LLM brain
- [Hooks](./hooks.md): timers, cron jobs, events
- [Infrastructure](./infrastructure.md): database, pub/sub, observability
