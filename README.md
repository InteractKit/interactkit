# InteractKit

**Build worlds of AI agents in TypeScript. Scale them across machines with one line.**

Define agents as classes. Give them brains, memory, and tools with decorators. Snap them together into a tree -- the tree *is* the architecture. Entities call each other like normal functions, even across machines. Functions and objects pass transparently over the wire.

```bash
npm i -g @interactkit/cli
interactkit init my-world
cd my-world && pnpm install && pnpm dev
```

---

## Why InteractKit

Most AI frameworks give you one agent with a list of tools. That works for a chatbot. Real systems are bigger than a chatbot.

InteractKit gives you **composable, self-describing entities**. An entity does one thing. It describes itself. Entities compose into a tree. The tree is the architecture. The architecture tells the LLM what to do.

```
ContentTeam
  ├── Planner (LLM)              <- decides what to do, delegates
  ├── Researcher
  │   ├── ResearchBrain (LLM)    <- searches, reads, remembers
  │   ├── Browser
  │   └── Memory
  ├── Writer
  │   ├── WriterBrain (LLM)      <- drafts content using research
  │   └── Templates
  └── SharedContext               <- shared conversation across all brains
```

Each brain has its own LLM, its own tools, its own state. The Planner calls `researcher.research()`, then `writer.write()`. Each sub-agent handles its own domain. You didn't write orchestration logic -- each LLM figures out what to do at its level.

---

## What You Can Build

- **Agent teams** -- a router brain triages to specialists, each with their own LLM and tools
- **Agents with memory** -- persistent state that survives restarts, syncs across replicas
- **MCP-powered worlds** -- Slack, GitHub, Jira, Stripe as typed entities with one CLI command
- **Autonomous systems** -- entities that react to HTTP webhooks, cron schedules, timers
- **Simulations** -- 50 personas, each with their own brain, memory, and social feeds
- **Distributed systems** -- entities that scale horizontally, pass functions across machines

---

## Quick Start

```bash
interactkit init my-world
cd my-world
pnpm install
pnpm dev
```

Add entities:

```bash
interactkit add Memory --attach Agent                                  # plain entity
interactkit add Brain --llm --attach Agent                             # LLM entity
interactkit add Slack --mcp-stdio "npx -y @slack/mcp" --attach Agent   # MCP server → typed entity
```

Scale an entity to another machine:

```typescript
import { Entity, BaseEntity, Component, Tool, type Remote, RedisPubSubAdapter } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
class Worker extends BaseEntity {
  @Tool({ description: 'Process task' })
  async process(input: { task: string }) { return input.task.toUpperCase(); }
}

@Entity()
class Agent extends BaseEntity {
  @Component() private worker!: Remote<Worker>;  // type-safe distributed access

  @Tool({ description: 'Do work' })
  async work(input: { task: string }) {
    return this.worker.process(input);  // works across machines
  }
}
```

Run 5 replicas. Tasks distribute automatically. State syncs via Redis. Same code.

---

## Key Features

**Self-describing entities.** Every entity has a `@Describe()` method that returns its current state as a string. LLMs get system prompts composed from live descriptions -- the prompt evolves as the world changes.

**Transparent distribution.** Add `Remote<T>` to a component type and give it a Redis adapter. It now runs on a different machine. Method calls, return values, even *functions* -- all proxied automatically.

**MCP servers as entities.** `interactkit add Slack --mcp-stdio "npx -y @slack/mcp"` generates a typed entity. The LLM gets all of Slack's tools alongside yours.

**Hooks.** Entities act on their own. `@Hook(Init.Runner())` for startup, `@Hook(Tick.Runner({ intervalMs: 5000 }))` for intervals, `@Hook(Cron.Runner({ expression: '0 9 * * 1' }))` for schedules, `@Hook(HttpRequest.Runner({ port: 3100 }))` for webhooks.

**State persistence.** `@State` properties auto-save to the database. State restores on restart. State syncs between replicas automatically.

**Build-time safety.** The build catches missing decorators, bad refs, unknown components, and missing `Remote<T>` on distributed entities before your app runs.

---

## Docs

Full documentation at **[docs.interactkit.dev](https://docs.interactkit.dev)**

| Guide | What you'll learn |
|-------|-------------------|
| [Why InteractKit](https://docs.interactkit.dev/#/why) | Architecture philosophy, what you can build |
| [Getting Started](https://docs.interactkit.dev/#/getting-started) | First project, first entity, CLI commands |
| [Entities](https://docs.interactkit.dev/#/entities) | State, tools, components, refs, streams, `Remote<T>` |
| [LLM Entities](https://docs.interactkit.dev/#/llm) | AI-powered entities with LangChain |
| [Hooks](https://docs.interactkit.dev/#/hooks) | Init, tick, cron, HTTP, custom hooks |
| [Infrastructure](https://docs.interactkit.dev/#/infrastructure) | Database, pub/sub, logging adapters |
| [Deployment](https://docs.interactkit.dev/#/deployment) | Docker, scaling, distributed units |

## Packages

| Package | Description |
|---------|-------------|
| [`@interactkit/sdk`](https://github.com/InteractKit/interactkit/tree/main/sdk) | Core: decorators, runtime, LLM, MCP, transparent proxy |
| [`@interactkit/cli`](https://github.com/InteractKit/interactkit/tree/main/cli) | CLI: init, add, build, dev |
| [`@interactkit/http`](https://github.com/InteractKit/interactkit/tree/main/extensions/http) | HTTP server hook |
| [`@interactkit/websocket`](https://github.com/InteractKit/interactkit/tree/main/extensions/websocket) | WebSocket hook |
