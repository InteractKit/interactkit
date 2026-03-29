# InteractKit

**Build agent swarms, virtual worlds, and autonomous systems in TypeScript.**

InteractKit lets you create worlds where AI agents live, think, and collaborate. Each agent has its own brain, memory, and tools. Agents organize into teams. Teams scale across machines. One line of code.

```bash
npm i -g @interactkit/cli
interactkit init my-world
cd my-world && pnpm install && pnpm dev
```

---

## Build a Customer Support Team

A triage agent classifies incoming tickets. Billing and technical specialists handle their domains. Each has its own LLM, its own tools, its own knowledge.

```
SupportTeam
  ├── Triage (LLM)           ← classifies issues, routes to specialists
  ├── BillingAgent
  │   ├── BillingBrain (LLM) ← handles refunds, invoices, account issues
  │   ├── Stripe (MCP)       ← real Stripe API access
  │   └── Memory             ← remembers past interactions
  ├── TechAgent
  │   ├── TechBrain (LLM)    ← debugs problems, searches docs
  │   ├── Docs               ← knowledge base search
  │   └── Jira (MCP)         ← creates tickets automatically
  └── SharedContext           ← all agents share the conversation
```

```bash
interactkit init support-team
interactkit add Triage --llm --attach SupportTeam
interactkit add Stripe --mcp-stdio "npx -y @stripe/mcp" --attach BillingAgent
interactkit add Jira --mcp-stdio "npx -y @jira/mcp" --attach TechAgent
```

No orchestration code. Each agent figures out what to do at its level.

---

## Run a Social Simulation

50 AI personas, each with a unique personality, memory, and social presence. They post, react, and evolve over weeks.

```
Simulation
  ├── Persona("Alice")
  │   ├── Brain (LLM)        ← Alice's personality and decision-making
  │   ├── Memory             ← what Alice remembers (grows over time)
  │   ├── Reddit
  │   │   ├── Humanizer      ← makes posts sound like Alice
  │   │   └── PostHistory
  │   └── Twitter
  │       ├── Humanizer
  │       └── PostHistory
  ├── Persona("Bob")
  │   ├── Brain (LLM)        ← completely different personality
  │   ├── Memory             ← independent memory
  │   └── Reddit
  └── Coordinator
      ├── Brain (LLM)        ← oversees the simulation
      └── Analytics
```

Each persona acts on its own schedule. State persists between runs. Over weeks, each persona builds up unique memories and behavior patterns. That's a virtual world.

---

## Create an Autonomous Monitoring System

Agents that watch, decide, and act -- no human in the loop.

```typescript
@Entity()
class Monitor extends BaseEntity {
  @Ref() private brain!: Brain;

  @Hook(Tick.Runner({ intervalMs: 60000 }))
  async onTick() {
    const cpu = await checkCPU();
    if (cpu > 90) {
      await this.brain.invoke({ message: `CPU is at ${cpu}%. What should we do?` });
    }
  }
}
```

The Brain decides whether to alert Slack, scale infrastructure, or create a PagerDuty incident. Wire in any external service with one CLI command:

```bash
interactkit add Slack --mcp-stdio "npx -y @slack/mcp" --attach Monitor
interactkit add PagerDuty --mcp-stdio "npx -y @pagerduty/mcp" --attach Monitor
```

---

## Build a Content Creation Pipeline

A research agent finds information. A writer drafts content. A reviewer checks quality. They share context so nothing gets repeated.

```
ContentTeam
  ├── Planner (LLM)            ← decides the plan, delegates
  ├── Researcher
  │   ├── ResearchBrain (LLM)  ← searches and reads
  │   ├── Browser              ← web access
  │   └── Memory               ← stores findings
  ├── Writer
  │   ├── WriterBrain (LLM)    ← drafts content from research
  │   └── Templates
  ├── Reviewer
  │   ├── ReviewerBrain (LLM)  ← checks quality and style
  │   └── StyleGuide
  └── SharedContext             ← all brains share the conversation
```

The Planner calls `researcher.research()`, then `writer.write()`, then `reviewer.review()`. Each sub-agent handles its own domain. You write the tree, not the coordination.

---

## Scale Across Machines

Any agent can run on a different machine. Same code. One decorator change.

```typescript
@Entity({ detached: true })
class Worker extends BaseEntity {
  @Tool({ description: 'Process task' })
  async process(input: { task: string }) { return input.task.toUpperCase(); }
}

@Entity()
class Agent extends BaseEntity {
  @Component() private worker!: Remote<Worker>;

  @Tool({ description: 'Do work' })
  async work(input: { task: string }) {
    return this.worker.process(input);  // works across machines
  }
}
```

Run 5 replicas. Tasks distribute automatically. Functions, objects, even callbacks pass transparently over the wire.

---

## How It Works

Everything is an **entity** -- a TypeScript class that does one thing.

```typescript
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
@Entity()
class Brain extends LLMEntity {
  @Describe()
  describe() { return 'You are a helpful assistant. Search memory before answering.'; }

  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private memory!: Memory;
}
```

Snap entities together and the tree **is** the architecture:

```typescript
@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private memory!: Memory;
}
```

The LLM automatically sees all available tools. You don't write orchestration logic.

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
| Create a new world | `interactkit init my-world` |
| Add an agent with a brain | `interactkit add Brain --llm --attach Agent` |
| Add memory | `interactkit add Memory --attach Agent` |
| Connect Slack, GitHub, etc. | `interactkit add Slack --mcp-stdio "npx -y @slack/mcp"` |
| Make an agent autonomous | Add `@Hook(Tick.Runner({ intervalMs: 5000 }))` |
| Scale to another machine | Add `{ detached: true }` to `@Entity()` |
| Share context between brains | Use `ConversationContext` as a shared `@Component` |

---

## Docs

Full documentation at **[docs.interactkit.dev](https://docs.interactkit.dev)**

| Guide | What you'll build |
|-------|-------------------|
| [Getting Started](https://docs.interactkit.dev/#/getting-started) | Your first agent with brain and memory |
| [Use Cases & Recipes](https://docs.interactkit.dev/#/why) | Agent teams, simulations, autonomous systems |
| [Entities](https://docs.interactkit.dev/#/entities) | State, tools, components, refs, streams |
| [LLM Entities](https://docs.interactkit.dev/#/llm) | Brains, shared context, router patterns |
| [Hooks](https://docs.interactkit.dev/#/hooks) | Timers, cron, HTTP, webhooks |
| [Infrastructure](https://docs.interactkit.dev/#/infrastructure) | Database, pub/sub, logging |
| [Deployment](https://docs.interactkit.dev/#/deployment) | Docker, scaling, distributed systems |

## Packages

| Package | Description |
|---------|-------------|
| [`@interactkit/sdk`](https://github.com/InteractKit/interactkit/tree/main/sdk) | Core: decorators, runtime, LLM, MCP, transparent proxy |
| [`@interactkit/cli`](https://github.com/InteractKit/interactkit/tree/main/cli) | CLI: init, add, build, dev |
| [`@interactkit/http`](https://github.com/InteractKit/interactkit/tree/main/extensions/http) | HTTP server hook |
| [`@interactkit/websocket`](https://github.com/InteractKit/interactkit/tree/main/extensions/websocket) | WebSocket hook |
