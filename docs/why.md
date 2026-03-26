# Why InteractKit

Most AI frameworks give you one agent with a list of tools. That works for a chatbot. But real systems are bigger than a chatbot.

What if you want 50 personas running a social simulation? A team of specialists that delegate to each other? A monitoring system that detects, decides, and acts -- no human in the loop? These need **architecture**, not a bigger tool list.

InteractKit gives you architecture: **composable, self-describing entities**.

An entity is a TypeScript class that does one thing. It remembers things (`@State`). It can do things (`@Tool`). It describes itself (`@Describe()`). You snap entities together into a tree, and the tree **is** the architecture -- every entity knows what its siblings can do, every LLM gets a system prompt composed automatically from the descriptions around it.

---

## Think of It Like a Company

A company has departments. Each department has teams. Each team has people. Each person has a job.

InteractKit works the same way. Entities contain entities, as deep as you need:

```
Company
  ├── CEO (LLM)                    ← delegates to departments
  ├── Engineering
  │   ├── EngineeringLead (LLM)    ← manages engineers
  │   ├── Frontend
  │   │   ├── FrontendDev (LLM)
  │   │   └── ComponentLibrary
  │   └── Backend
  │       ├── BackendDev (LLM)
  │       └── Database
  ├── Marketing
  │   ├── MarketingLead (LLM)
  │   ├── Copywriter (LLM)
  │   └── Analytics
  └── Support
      ├── SupportBrain (LLM)
      ├── TicketSystem
      └── KnowledgeBase
```

Every box is an entity. Each one has its own state, its own tools, and its own LLM if it needs one. The CEO delegates to department leads. Department leads delegate to their teams. You don't write the coordination logic. Each LLM figures out what to do at its level.

---

## What You Can Build

### LLM Agents

An entity with an LLM brain that calls tools:

```typescript
@Entity()
class Brain extends LLMEntity {
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });

  @Ref() private browser!: Browser;
  @Ref() private memory!: Memory;

  @Describe()
  describe() {
    return `You are a helpful research assistant with access to a browser and memory.`;
  }
}
```

The `@Describe()` method returns a string that feeds directly into the LLM's system prompt. Because it's a method, it can include dynamic state -- the prompt evolves as the entity's world changes.

You say `brain.invoke({ message: "Find info about TypeScript and save it" })`. The LLM calls `browser.search()`, reads the results, calls `memory.store()`, and gives you a final answer. All automatic.

### Multi-Agent Systems

Agents contain other agents. Each sub-agent has its own LLM, its own tools, its own state:

```
ContentTeam
  ├── Planner (LLM)            ← decides the plan, delegates
  ├── Researcher               ← finds information
  │   ├── ResearchBrain (LLM)
  │   ├── Browser
  │   └── Memory
  ├── Writer                   ← drafts content
  │   ├── WriterBrain (LLM)
  │   └── Templates
  └── Reviewer                 ← checks quality
      ├── ReviewerBrain (LLM)
      └── StyleGuide
```

The Planner calls `researcher.research()`, then `writer.write()`, then `reviewer.review()`. Each sub-agent handles its own domain with its own tools. The Researcher's Brain can call `browser.search()` and `memory.store()` without the Planner knowing or caring how research works internally.

When multiple brains need to share conversation history -- so the Writer knows what the Researcher found without repeating context -- use `ConversationContext`. The parent owns it as a `@Component`, each brain references it via `@Ref`, and switching between brains preserves the full conversation. See [Shared Conversation Context](./llm.md#shared-conversation-context).

You didn't write orchestration logic. Each LLM figures out what to do at its level.

### Simulations

Run many independent entities, each with their own world inside them:

```
Simulation
  ├── Persona("Alice")
  │   ├── Brain (LLM)          ← Alice's personality and decision-making
  │   ├── Memory               ← what Alice remembers
  │   ├── Reddit               ← Alice's Reddit presence
  │   │   ├── Humanizer        ← makes text sound like Alice
  │   │   └── PostHistory      ← tracks what Alice has posted
  │   └── Twitter
  │       ├── Humanizer
  │       └── PostHistory
  ├── Persona("Bob")
  │   ├── Brain (LLM)          ← Bob's personality (different from Alice)
  │   ├── Memory               ← what Bob remembers (independent)
  │   └── Reddit
  │       ├── Humanizer
  │       └── PostHistory
  └── Coordinator
      ├── Brain (LLM)
      └── Analytics
```

Each persona acts on its own schedule (hooks). Alice's Brain decides what to post. Her Reddit Humanizer makes it sound like her. Her Memory accumulates over time. Bob does the same thing independently, with a completely different personality and history.

State persists between runs. Over weeks, each persona builds up unique memories and behavior patterns. That's a simulation.

### Autonomous Background Systems

Entities don't just wait to be called. They can act on their own:

```typescript
@Entity()
class Monitor extends BaseEntity {
  @Ref() private brain!: Brain;

  @Hook(Tick.Runner({ intervalMs: 60000 }))
  async onTick(input: Tick.Input) {
    const cpu = await checkCPU();
    if (cpu > 90) {
      await this.brain.invoke({ message: `CPU is at ${cpu}%` });
    }
  }
}
```

The Monitor checks CPU every minute. If it's high, it asks the Brain what to do. The Brain might call `slack.sendMessage()` or `pagerduty.alert()`. No human in the loop.

---

## How It Works Under the Hood

### Entities Talk Through an Event Bus

When you write `await this.memory.store({ text: 'hello' })`, it looks like a normal function call. Behind the scenes, it goes through an event bus.

Why does this matter? Because it means you can run entities in the same process or on different machines. Same code either way. An entity never knows or cares where its siblings are running.

### State Saves Automatically

Every `@State` property gets saved to the database. When an entity restarts, its state comes back. You don't manage this yourself.

```typescript
@State({ description: 'Stored entries' })
private entries: string[] = [];
```

### Streams Push Data in Real Time

A child entity can push data to its parent as it happens:

```typescript
@Entity()
class Sensor extends BaseEntity {
  private readings!: EntityStream<number>;

  @Hook(Tick.Runner({ intervalMs: 1000 }))
  async onTick(input: Tick.Input) {
    this.readings.emit(Math.random() * 100);
  }
}
```

The parent listens to the stream and reacts. Feed it into a Brain and the LLM processes real-time data as it arrives.

### MCP Servers Become Generated Code

Any [MCP](https://modelcontextprotocol.io) server becomes a first-class entity via the CLI:

```bash
interactkit add Slack --mcp-stdio "npx -y @slack/mcp-server"
```

This introspects the MCP server and generates a typed entity with real `@Tool` methods -- not a runtime proxy. The generated code lives in your project, so you can read it, extend it, or override individual tools.

Reference it from an LLMEntity and the LLM can use all of Slack's tools alongside your own. Your code, MCP-generated entities, extension packages -- they're all just entities with tools.

### Scaling Is One Line

```typescript
@Entity({ pubsub: RedisPubSubAdapter })
class Memory extends BaseEntity { /* ... */ }
```

Now Memory talks over Redis instead of in-memory. Run 5 replicas. The rest of the system doesn't change.

---

## The Big Picture

| Feature | What it does |
|---------|-------------|
| `@Entity` | A class that does one thing |
| `@Describe()` | A method that returns a string describing the entity's current state; auto-composes LLM system prompts |
| `@State` | Data that gets saved automatically |
| `@Tool` | A method other entities (or an LLM) can call |
| `@Component` / `@Ref` | Entities compose into trees, siblings talk to each other |
| `LLMEntity` | Extend to make all refs/tools visible to the LLM |
| `@Hook` | Entities act on their own: timers, crons, events |
| `interactkit add --mcp-stdio` | Any MCP server becomes a generated, typed entity |
| `EntityStream` | Real-time data flows between entities |
| Pluggable adapters | Swap database, pub/sub, logging without changing entity code |

Each one is useful on its own. Together they let you build things that are hard to build any other way: multi-agent systems, real-world simulations, autonomous infrastructure, and anything else where independent pieces need their own state, their own logic, and the ability to talk to each other.

**One entity does one thing. It describes itself. Entities compose into a tree. The tree is the architecture. The architecture tells the LLM what to do.**

---

## Next Steps

Ready to build? Start with the [Getting Started](./getting-started.md) guide.
