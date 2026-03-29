# InteractKit

**Build agent swarms, virtual worlds, and autonomous systems in TypeScript.**

Create worlds where AI agents live, think, and work together. Each agent has its own brain, memory, and tools. Snap them into teams. Scale them across machines.

---

## Get Running in 60 Seconds

```bash
npm i -g @interactkit/cli
interactkit init my-world
cd my-world && pnpm install
```

Add your OpenAI key to `.env`:

```
OPENAI_API_KEY=sk-...
```

Start it:

```bash
pnpm dev
```

You now have a running agent with an LLM brain, memory, and an HTTP endpoint.

---

## What Can You Build?

### Agent Swarms

Teams of specialized agents that delegate, collaborate, and solve problems together.

```
SupportTeam
  ├── Triage (LLM)              ← classifies issues, routes to specialists
  ├── BillingAgent
  │   ├── BillingBrain (LLM)    ← handles refunds, invoices
  │   ├── Stripe (MCP)          ← real Stripe API
  │   └── Memory
  ├── TechAgent
  │   ├── TechBrain (LLM)       ← debugs, searches docs
  │   ├── Docs
  │   └── Jira (MCP)            ← creates tickets
  └── SharedContext              ← all agents share conversation history
```

Each agent has its own brain, its own tools, its own domain. The triage agent routes. The specialists handle. No orchestration code -- each LLM figures out what to do at its level.

### Virtual Worlds & Simulations

Dozens of AI personas, each with unique personalities, memories, and social lives.

```
Simulation
  ├── Persona("Alice")
  │   ├── Brain (LLM)           ← Alice's personality
  │   ├── Memory                ← grows over time
  │   ├── Reddit                ← posts, reacts
  │   └── Twitter               ← independent presence
  ├── Persona("Bob")
  │   ├── Brain (LLM)           ← completely different personality
  │   ├── Memory                ← independent memory
  │   └── Reddit
  └── Coordinator
      └── Analytics
```

State persists between runs. Over weeks, each persona accumulates unique memories and evolves its behavior. That's a virtual world.

### Autonomous Systems

Agents that watch, decide, and act on their own -- no human in the loop.

```
InfraMonitor
  ├── Brain (LLM)               ← decides what to do
  ├── Slack (MCP)               ← sends alerts
  ├── PagerDuty (MCP)           ← escalates incidents
  └── CloudAPI                  ← scales infrastructure
```

Wire hooks to timers, cron schedules, or HTTP webhooks:

```typescript
@Hook(Tick.Runner({ intervalMs: 60000 }))    // every minute
@Hook(Cron.Runner({ expression: '0 9 * * *' })) // daily at 9am
@Hook(HttpRequest.Runner({ port: 3000 }))    // on webhook
```

### Content Pipelines

Research, write, review -- agents that pass work through a pipeline.

```
ContentTeam
  ├── Planner (LLM)             ← decides what to create
  ├── Researcher
  │   ├── ResearchBrain (LLM)   ← finds information
  │   ├── Browser               ← web access
  │   └── Memory
  ├── Writer
  │   ├── WriterBrain (LLM)     ← drafts content
  │   └── Templates
  └── Reviewer
      ├── ReviewerBrain (LLM)   ← checks quality
      └── StyleGuide
```

### Distributed Agent Networks

Agents that scale horizontally across machines. Same code, different processes.

```typescript
@Entity({ detached: true })
class Worker extends BaseEntity { /* runs on machine B */ }

@Entity()
class Agent extends BaseEntity {
  @Component() private worker!: Remote<Worker>;  // calls go over the wire
}
```

Run 5 replicas. Tasks distribute automatically. Functions and objects pass transparently.

---

## The Core Idea

Everything is an **entity** -- a class that does one thing.

```typescript
@Entity()
class Memory extends BaseEntity {
  @Describe()
  describe() { return `Memory with ${this.entries.length} entries.`; }

  @State({ description: 'Stored entries' })
  private entries: string[] = [];

  @Tool({ description: 'Store something' })
  async store(input: { text: string }) { this.entries.push(input.text); }
}
```

Give an entity a brain:

```typescript
@Entity()
class Brain extends LLMEntity {
  @Describe()
  describe() { return 'You are a helpful assistant.'; }
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private memory!: Memory;
}
```

Snap them together:

```typescript
@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private memory!: Memory;
}
```

The Brain automatically sees Memory's tools. Call `brain.invoke({ message: "remember that I like coffee" })` and the LLM decides to call `memory.store()`. You didn't write the glue.

---

## Add Any Service Instantly

Any [MCP](https://modelcontextprotocol.io) server becomes a typed entity:

```bash
interactkit add Slack --mcp-stdio "npx -y @slack/mcp" --attach Agent
interactkit add GitHub --mcp-stdio "npx -y @github/mcp" --attach Agent
interactkit add Stripe --mcp-stdio "npx -y @stripe/mcp" --attach Agent
```

Your agents can now use Slack, GitHub, Stripe -- alongside your own tools, all as natural function calls.

---

## Next Steps

Pick your path:

| I want to... | Start here |
|--------------|-----------|
| Build my first agent | [Getting Started](getting-started.md) |
| Understand the philosophy | [Why InteractKit](why.md) |
| Build agent teams | [LLM Entities](llm.md) (router pattern, shared context) |
| Add timers, cron, webhooks | [Hooks](hooks.md) |
| Scale across machines | [Infrastructure](infrastructure.md) → [Deployment](deployment.md) |
| Connect external services | [LLM Entities](llm.md#mcp-as-entities) |

| Reference | What's inside |
|-----------|--------------|
| [Entities](entities.md) | State, tools, components, refs, streams, `Remote<T>` |
| [Codegen & Build](codegen.md) | What `interactkit build` generates |
| [Testing](testing.md) | bootTest, mockLLM, mockEntity |
| [Extensions](extensions.md) | Custom hooks and MCP integrations |
| [Optimisation](optimisation.md) | When and what to tune |
