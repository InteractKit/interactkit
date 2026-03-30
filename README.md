# InteractKit

**Build agent swarms, virtual worlds, and autonomous systems in TypeScript.**

InteractKit lets you compose AI agents from plain TypeScript classes. Each agent has its own brain, memory, and tools. Agents snap together as a tree. The tree scales across machines with one decorator change.

```bash
npm i -g @interactkit/cli
interactkit init my-world
cd my-world && pnpm install && pnpm dev
```

---

## How It Works

Everything is an **entity** -- a TypeScript class that does one thing.

```typescript
import { Entity, BaseEntity, Describe, State, Tool } from '@interactkit/sdk';

@Entity()
class Memory extends BaseEntity {
  @Describe()
  describe() { return `Memory with ${this.entries.length} entries.`; }

  @State({ description: 'Stored entries' })
  private entries: string[] = [];

  @Tool({ description: 'Store something' })
  async store(input: { text: string }) { this.entries.push(input.text); }

  @Tool({ description: 'Search entries' })
  async search(input: { query: string }) {
    return this.entries.filter(e => e.includes(input.query));
  }
}
```

Give an entity a brain and it can think:

```typescript
import { Entity, LLMEntity, Describe, Executor, Ref } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity()
class Brain extends LLMEntity {
  @Describe()
  describe() { return 'You are a helpful assistant. Search memory before answering.'; }

  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private memory!: Remote<Memory>;
}
```

Snap entities together and the tree **is** the architecture:

```typescript
import { Entity, BaseEntity, Component, type Remote } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Remote<Brain>;
  @Component() private memory!: Remote<Memory>;
}
```

The LLM automatically sees all available tools. You don't write orchestration logic.

---

## Build a Customer Support Team

```
SupportTeam
  +-- Triage (LLM)           <-- classifies issues, routes to specialists
  +-- BillingAgent
  |   +-- BillingBrain (LLM) <-- handles refunds, invoices, account issues
  |   +-- Stripe (MCP)       <-- real Stripe API access
  |   +-- Memory             <-- remembers past interactions
  +-- TechAgent
  |   +-- TechBrain (LLM)    <-- debugs problems, searches docs
  |   +-- Docs               <-- knowledge base search
  |   +-- Jira (MCP)         <-- creates tickets automatically
  +-- SharedContext           <-- all agents share the conversation
```

```bash
interactkit init support-team
interactkit add Triage --llm --attach SupportTeam
interactkit add Stripe --mcp-stdio "npx -y @stripe/mcp" --attach BillingAgent
interactkit add Jira --mcp-stdio "npx -y @jira/mcp" --attach TechAgent
```

No orchestration code. Each agent figures out what to do at its level.

---

## Create an Autonomous System

Agents that watch, decide, and act -- no human in the loop.

```typescript
import { Entity, BaseEntity, Ref, Hook, Tick, type Remote } from '@interactkit/sdk';

@Entity()
class Monitor extends BaseEntity {
  @Ref() private brain!: Remote<Brain>;

  @Hook(Tick.Runner({ intervalMs: 60000 }))
  async onTick() {
    const cpu = await checkCPU();
    if (cpu > 90) {
      await this.brain.invoke({ message: `CPU is at ${cpu}%. What should we do?` });
    }
  }
}
```

Wire in any external service with one CLI command:

```bash
interactkit add Slack --mcp-stdio "npx -y @slack/mcp" --attach Monitor
interactkit add PagerDuty --mcp-stdio "npx -y @pagerduty/mcp" --attach Monitor
```

---

## Scale to Another Machine

Any entity can run on a different machine. Same code. One decorator change.

```typescript
import { Entity, BaseEntity, Component, Tool, Hook, Init, type Remote } from '@interactkit/sdk';

@Entity({ detached: true })
class Worker extends BaseEntity {
  @Tool({ description: 'Process task' })
  async process(input: { task: string }) { return input.task.toUpperCase(); }
}

@Entity()
class Agent extends BaseEntity {
  @Component() private worker!: Remote<Worker>;

  @Hook(Init.Runner())
  async onInit() {
    const result = await this.worker.process({ task: 'hello' }); // works across machines
  }
}
```

Run 5 replicas. Tasks distribute automatically. Functions, objects, and callbacks pass transparently over the wire.

---

## Configure Infrastructure

All infrastructure lives in `interactkit.config.ts` at the project root:

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
  timeout: 15_000,
  stateFlushMs: 50,
} satisfies InteractKitConfig;
```

---

## Add Any External Service

Any [MCP](https://modelcontextprotocol.io) server becomes a typed entity with one command:

```bash
interactkit add Slack --mcp-stdio "npx -y @slack/mcp" --attach Agent
interactkit add GitHub --mcp-stdio "npx -y @github/mcp" --attach Agent
interactkit add Stripe --mcp-stdio "npx -y @stripe/mcp" --attach Agent
```

Your agents can now send Slack messages, create GitHub issues, and process Stripe payments -- all as natural tool calls.

---

## Quick Reference

| You want to... | You do this |
|----------------|------------|
| Build your project | `interactkit build` |
| Create a new project | `interactkit init my-world` |
| Add an agent with a brain | `interactkit add Brain --llm --attach Agent` |
| Add memory | `interactkit add Memory --attach Agent` |
| Connect Slack, GitHub, etc. | `interactkit add Slack --mcp-stdio "npx -y @slack/mcp"` |
| Make an agent autonomous | Add `@Hook(Tick.Runner({ intervalMs: 5000 }))` |
| Scale to another machine | Add `{ detached: true }` to `@Entity()` |
| Share context between brains | Use `ConversationContext` as a shared `@Component` |

---

## Extension Ecosystem

| Package | Description |
|---------|-------------|
| `@interactkit/sdk` | Core: decorators, runtime, LLM, MCP, transparent proxy |
| `@interactkit/cli` | CLI: init, add, build, dev, start |
| `@interactkit/observer` | Observer dashboard backend (WebSocket + static UI server) |
| `@interactkit/observer-ui` | Observer dashboard frontend (Next.js, entity graph, event feed) |
| `@interactkit/redis` | Redis pub/sub adapter for distributed entities |
| `@interactkit/prisma` | Prisma database adapter for state persistence |
| `@interactkit/cron` | Cron scheduling hook (node-cron) |
| `@interactkit/http` | HTTP server hook |
| `@interactkit/websocket` | WebSocket hooks (WsMessage, WsConnection) |

---

## Docs

Full documentation at **[docs.interactkit.dev](https://docs.interactkit.dev)**

| Guide | What you'll learn |
|-------|-------------------|
| [Getting Started](https://docs.interactkit.dev/#/getting-started) | Your first agent with brain and memory |
| [Use Cases & Recipes](https://docs.interactkit.dev/#/why) | Agent teams, simulations, autonomous systems |
| [Entities](https://docs.interactkit.dev/#/entities) | State, tools, components, refs, streams |
| [LLM Entities](https://docs.interactkit.dev/#/llm) | Brains, shared context, router patterns |
| [Hooks](https://docs.interactkit.dev/#/hooks) | Timers, cron, HTTP, webhooks |
| [Infrastructure](https://docs.interactkit.dev/#/infrastructure) | Database, pub/sub, observability |
| [Deployment](https://docs.interactkit.dev/#/deployment) | Docker, scaling, distributed systems |
| [Extensions](https://docs.interactkit.dev/#/extensions) | Custom hooks and MCP integrations |
