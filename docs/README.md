# InteractKit

**Build LLM agents in TypeScript using classes, decorators, and zero glue code.**

InteractKit lets you build AI agents the same way you build any app -- write classes, add decorators, run it. No orchestration code, no JSON schemas, no manual wiring.

---

## Get Running in 60 Seconds

Install the CLI:

```bash
npm i -g @interactkit/cli
```

Create a project:

```bash
interactkit init my-world
cd my-world
pnpm install
```

Add your OpenAI key to `.env`:

```
OPENAI_API_KEY=sk-...
```

Start it:

```bash
pnpm dev
```

That's it. You have a running agent with an LLM brain, memory, and an HTTP endpoint.

---

## How It Works

Everything in InteractKit is an **entity** -- a class that does one job.

```typescript
import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity()
class Memory extends BaseEntity {
  @Describe()
  describe() { return `Memory with ${this.entries.length} entries.`; }

  @State({ description: 'Stored entries' })
  private entries: string[] = [];

  @Tool({ description: 'Store something' })
  async store(input: { text: string }) {
    this.entries.push(input.text);
  }

  @Tool({ description: 'Search entries' })
  async search(input: { query: string }) {
    return this.entries.filter(e => e.includes(input.query));
  }
}
```

Here's what those decorators do:

| Decorator | What it does |
|-----------|-------------|
| `@Entity()` | Registers the class with the framework |
| `@Describe()` | **Required.** Tells the framework (and LLMs) what this entity does right now |
| `@State()` | Saves this property to the database automatically |
| `@Tool()` | Exposes this method so an LLM (or other entities) can call it |

That's really it. You write a class, mark what matters, and the framework handles the rest.

---

## Give an Entity a Brain

Want an entity that can think? Extend `LLMEntity` instead of `BaseEntity`:

```typescript
import { Entity, LLMEntity, Describe, Executor, Ref } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity()
class Brain extends LLMEntity {
  @Describe()
  describe() {
    return 'You are a helpful assistant. Search memory before answering.';
  }

  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private memory!: Memory;
}
```

- `@Describe()` -- tells the LLM who it is (this becomes the system prompt)
- `@Executor()` -- which LLM to use
- `@Ref()` -- the Brain can see Memory's `@Tool` methods and call them

When you call `brain.invoke({ message: "remember that I like coffee" })`, the LLM sees the available tools, decides to call `memory.store()`, and responds. You don't write the tool loop.

---

## Connect Entities Together

Entities live in a tree. A parent holds its children as `@Component`s:

```typescript
import { Entity, BaseEntity, Component } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private memory!: Memory;
}
```

Children talk to siblings via `@Ref()`. The Brain above can reference Memory because they're siblings under the same parent.

You can also plug in any MCP server as an entity with one command:

```bash
interactkit add Slack --mcp-stdio "npx -y @slack/mcp-server" --attach Agent
```

This generates a typed `.ts` file. The Brain sees Slack's tools automatically.

---

## Make It Do Things

Entities can react to events using `@Hook()`:

```typescript
import { Hook, Tick, Cron } from '@interactkit/sdk';
import { HttpRequest } from '@interactkit/http';

// Respond to HTTP requests
@Hook(HttpRequest.Runner({ port: 3000, path: '/chat' }))
async onChat(input: HttpRequest.Input) { ... }

// Run on a schedule
@Hook(Cron.Runner({ expression: '0 9 * * *' }))
async dailyDigest(input: Cron.Input) { ... }

// Run on an interval
@Hook(Tick.Runner({ intervalMs: 30000 }))
async poll(input: Tick.Input) { ... }
```

---

## What You End Up With

A tree of entities that looks like your architecture:

```
Agent
  ├── Brain (LLM)        <- thinks, calls tools
  ├── Memory             <- stores and retrieves info
  └── Slack (MCP)        <- generated from MCP server
```

Scale it up and it still looks the same:

```
SupportTeam
  ├── Router (LLM)               <- triages requests
  ├── TechSupport
  │   ├── TechBrain (LLM)
  │   ├── Docs
  │   └── Memory
  ├── BillingSupport
  │   ├── BillingBrain (LLM)
  │   ├── Stripe (MCP)
  │   └── Memory
  └── SharedContext               <- shared history across all brains
```

No config files. No routing tables. The class tree is the architecture.

---

## Next Steps

You've seen the big picture. Now build something:

1. **[Getting Started](getting-started.md)** -- set up a project, write your first entity, wire it up
2. **[Entities](entities.md)** -- everything about state, tools, components, refs, and streams
3. **[LLM Entities](llm.md)** -- how to give entities a brain and make them smart

Once you're comfortable with those:

| Guide | What you'll learn |
|-------|-------------------|
| [Why InteractKit](why.md) | Philosophy and design decisions |
| [Hooks](hooks.md) | Timers, cron, HTTP, WebSocket |
| [Infrastructure](infrastructure.md) | Database, pub/sub, logging |
| [Codegen & Build](codegen.md) | What `interactkit build` generates |
| [Testing](testing.md) | bootTest, mockLLM, mockEntity |
| [Extensions](extensions.md) | Custom hooks and MCP integrations |
| [Deployment](deployment.md) | Taking it to production |
