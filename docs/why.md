# Why InteractKit

Most AI frameworks give you one agent with a list of tools. That's fine for a chatbot.

But what about a team of 10 agents that delegate to each other? A virtual world with 50 personas living their own lives? A monitoring system that detects, decides, and acts without a human?

These need **architecture**, not a bigger tool list.

---

## The Problem

You want to build a customer support system. You need:
- A triage agent that classifies tickets
- A billing specialist that talks to Stripe
- A tech specialist that searches docs and creates Jira tickets
- Shared conversation so the user doesn't repeat themselves

With most frameworks, you'd wire this together manually -- routing logic, state management, context passing, tool visibility control. Hundreds of lines of glue code.

With InteractKit, you describe it as a tree:

```
SupportTeam
  +-- Triage (LLM)
  +-- BillingAgent
  |   +-- BillingBrain (LLM)
  |   +-- Stripe (MCP)
  |   +-- Memory
  +-- TechAgent
  |   +-- TechBrain (LLM)
  |   +-- Docs
  |   +-- Jira (MCP)
  +-- SharedContext
```

Each box is a class. Each LLM sees exactly the tools it needs. The triage agent routes. The specialists handle. You write the tree, not the orchestration.

---

## What People Are Building

### Agent Swarms for Business Automation

Teams of specialists that mirror how real teams work:

- **Sales teams**: a lead qualifier, a CRM updater, a follow-up scheduler, each with their own brain and tools
- **Content teams**: a researcher, writer, editor, and publisher -- pipeline-style delegation
- **DevOps teams**: a monitor, incident responder, and post-mortem writer working together

Each agent has its own LLM, its own memory, its own external integrations. The lead agent delegates. Sub-agents handle their domain. Scale the bottleneck by marking it `detached: true` and running more replicas.

### Virtual Worlds & Social Simulations

AI personas with persistent identities that evolve over time:

```
Simulation
  +-- Persona("Alice")
  |   +-- Brain (LLM)        <-- unique personality
  |   +-- Memory             <-- accumulates over weeks
  |   +-- Reddit             <-- posts, votes, comments
  |   +-- Twitter            <-- separate presence
  +-- Persona("Bob")  ...
  +-- Persona("Carol")  ...
  +-- Coordinator
```

- Each persona has its own LLM with a unique personality prompt
- Memory persists between runs -- Alice remembers what she said last week
- Hooks trigger autonomous behavior (post every 4 hours, react to mentions)
- State syncs across replicas via remote pubsub

Over time, each persona develops a unique history. They don't just respond -- they *live*.

### Autonomous Infrastructure

Systems that watch, think, and act without human intervention:

- A monitor checks metrics every minute
- If something is wrong, it asks a Brain what to do
- The Brain calls Slack to alert, PagerDuty to escalate, or CloudAPI to scale
- A Cron hook runs daily reports

```typescript
@Hook(Tick.Runner({ intervalMs: 60000 }))
async check() {
  const status = await this.healthCheck.run();
  if (!status.healthy) {
    await this.brain.invoke({ message: `Issue detected: ${status.error}` });
  }
}
```

No human in the loop. The agent swarm handles it end to end.

### Multi-Modal Assistants

Agents that combine different capabilities seamlessly:

- A conversational agent with browser access, code execution, and file management
- Each capability is its own entity with focused tools
- The brain decides which to use based on the conversation

```
Assistant
  +-- Brain (LLM)
  +-- Browser          <-- search, read pages
  +-- CodeRunner       <-- execute snippets
  +-- FileManager      <-- read, write, organize files
  +-- Memory           <-- long-term context
  +-- Slack (MCP)      <-- communicate results
```

---

## Why a Tree?

Think of it like a company. A company has departments. Departments have teams. Teams have people. Each person has a job.

InteractKit works the same way. Entities contain entities, as deep as you need. Each entity:

- **Does one thing** (`@Tool` methods)
- **Describes itself** (`@Describe()` feeds LLM prompts automatically)
- **Remembers things** (`@State` persists to database)
- **Knows its neighbors** (`@Ref` for siblings, `@Component` for children)

The tree IS the architecture. Adding a new capability means adding a new entity to the tree. No routing tables, no config files, no glue code.

---

## What Makes It Different

| Challenge | How InteractKit handles it |
|-----------|--------------------------|
| Agent coordination | Agents compose into a tree. Each LLM delegates to children/siblings. |
| Tool visibility | Each brain only sees tools from its refs and components. No filtering. |
| Shared context | `ConversationContext` lets multiple brains share one conversation. |
| Persistent state | `@State` auto-saves to database, restores on restart, syncs replicas. |
| External services | `interactkit add Slack --mcp-stdio "..."` generates a typed entity. |
| Scaling | `detached: true` + `Remote<T>`. Same code runs across machines. |
| Autonomy | `@Hook` with tick, cron, HTTP, events. Agents act on their own. |
| Observability | Streams expose every LLM response and tool call in real time. |

---

## Next Steps

Ready to build? Start with the [Getting Started](./getting-started.md) guide.

Want to see the building blocks? Jump to [Entities](./entities.md) or [LLM Entities](./llm.md).
