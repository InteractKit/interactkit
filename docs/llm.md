# LLM Entities

An LLM entity is an entity with a brain. It extends `LLMEntity` instead of `BaseEntity`, giving it a built-in `invoke()` method, conversation context, and observable streams. All `@Ref` siblings and `@Component` children automatically have their `@Tool` methods exposed to the LLM.

## The Pattern

You have entities that each do one thing:

```typescript
import { Entity, BaseEntity, Tool } from '@interactkit/sdk';

@Entity()
class Browser extends BaseEntity {
  @Tool({ description: 'Search the web' })
  async search(input: { query: string }): Promise<string[]> { /* ... */ }

  @Tool({ description: 'Read a page' })
  async read(input: { url: string }): Promise<string> { /* ... */ }
}

@Entity()
class Memory extends BaseEntity {
  @Tool({ description: 'Store something' })
  async store(input: { text: string }): Promise<void> { /* ... */ }

  @Tool({ description: 'Search memories' })
  async search(input: { query: string }): Promise<string[]> { /* ... */ }
}
```

Then one LLM entity that decides what to use and when:

```typescript
import { Entity, LLMEntity, Describe, Executor, Ref, Tool } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity({ description: 'LLM-powered decision making' })
class Brain extends LLMEntity {
  @Describe()
  describe() {
    return `You are a ${this.personality} assistant.`;
  }

  @Executor()
  private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });

  @Ref() private browser!: Browser;
  @Ref() private memory!: Memory;

  @Tool({ description: 'Summarize text' })
  async summarize(input: { text: string }): Promise<string> {
    return `Summary: ${input.text.slice(0, 100)}...`;
  }
}
```

The LLM now has access to: `browser.search()`, `browser.read()`, `memory.store()`, `memory.search()`, and `summarize()`. No glue code needed. All refs and components are visible to the LLM by default.

## The Thinking Loop

Every LLMEntity runs a continuous **thinking loop** -- an inner monologue that ticks on an interval. The LLM thinks, uses tools, and responds to tasks.

```
invoke("Find info about TypeScript")
  │
  └──→ pushed as a task to the thinking loop
         │
         ├── Tick 1: LLM sees the task, calls browser.search()
         ├── Tick 1: LLM calls memory.store()
         ├── Tick 1: LLM calls respond(taskId, "Found and saved it")
         │            └── invoke() promise resolves
         │
         ├── Tick 2: No tasks. LLM reflects: "I should check if the
         │           search results were comprehensive enough..."
         │
         └── Tick 3: No tasks, nothing changed → idle (no LLM call, free)
```

`invoke()` doesn't call the LLM directly. It pushes a task. The thinking loop picks it up, and the LLM uses a built-in `respond()` tool to return the result. Between tasks, the LLM can think, act, or sleep.

---

## `LLMEntity` Base Class

Extend `LLMEntity` instead of `BaseEntity` to get LLM capabilities. `LLMEntity` itself extends `BaseEntity`, so all standard entity features (state, components, hooks, streams) still work.

What you get out of the box:

| Built-in | Description |
|----------|-------------|
| `invoke(params)` | Push a task to the thinking loop. Returns a promise resolved when the LLM calls `respond()`. |
| Thinking loop | Continuous tick loop with inner monologue. All LLMEntities get one by default. |
| `context` | `protected context = new LLMContext()` -- conversation history with sliding window. |
| `response` stream | `EntityStream<string>` -- emits each LLM response (including inner monologue). |
| `toolCall` stream | `EntityStream<ToolCallEvent>` -- emits each tool call with `{ tool, args, result }`. |
| `isIdle()` | Returns true if no tasks pending and LLM is not thinking. |

### Built-in Streams

Every `LLMEntity` exposes two streams that parents can subscribe to:

```typescript
import { BaseEntity, Component, Hook, Init } from '@interactkit/sdk';
import type { ToolCallEvent } from '@interactkit/sdk';

class Agent extends BaseEntity {
  @Component() private brain!: Brain;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    // Watch every LLM response
    this.brain.response.on('data', (text: string) => {
      console.log('LLM said:', text);
    });

    // Watch every tool call
    this.brain.toolCall.on('data', (event: ToolCallEvent) => {
      console.log(`Tool called: ${event.tool}`, event.args, event.result);
    });
  }
}
```

---

## The Decorators

### `@Describe()`

Marks a method that returns a string describing the entity's current state. Works on **any** entity, not just `LLMEntity`. The method is called before each LLM invocation so it can include dynamic state via template literals:

```typescript
@Describe()
describe() {
  return `You are a ${this.personality} assistant. Current mood: ${this.mood}.`;
}
```

On an `LLMEntity`, the actual system prompt sent to the model is **auto-composed**: the brain's own `@Describe()` output comes first, followed by each ref'd entity's `@Describe()` output prefixed with `[refName]`. This gives the LLM a live snapshot of every entity it can interact with:

```
You are a curious assistant. Current mood: focused.

[browser] Headless browser. Cache has 12 pages.
[memory] Long-term memory store. 47 entries indexed.
```

### `@Executor()`

Points to your LLM model. Any LangChain `BaseChatModel` works:

```typescript
import { Executor } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

@Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
@Executor() private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
@Executor() private llm = new ChatGoogleGenerativeAI({ model: 'gemini-pro' });
```

### `@Tool({ description, llmCallable? })`

Makes a method callable. On an `LLMEntity`, there are two kinds of tools:

- **External tools** (default) -- called by other entities, NOT visible to the LLM during its thinking loop. These are your API.
- **LLM-callable tools** (`llmCallable: true`) -- visible to the LLM during the thinking loop. These are the LLM's hands.

```typescript
// The LLM can use this during its thinking loop
@Tool({ description: 'Move in a direction', llmCallable: true })
async move(input: { direction: string }): Promise<string> { /* ... */ }

// Only callable by other entities (e.g. GameMaster calls this)
@Tool({ description: 'Someone talks to this NPC' })
async talk(input: { from: string; message: string }): Promise<string> {
  return this.invoke({ message: `${input.from} says: "${input.message}"` });
}
```

This separation prevents recursion (the LLM calling its own external methods) and keeps the tool set clean.

### `@Ref()` and `@Component()`

On an `LLMEntity`, all refs and components are automatically visible to the LLM. Their `@Tool` methods become available tools (no `llmCallable` needed -- ref/component tools are always LLM-visible):

```typescript
@Ref() private browser!: Browser;
// LLM can call browser.search(), browser.read()

@Component() private memory!: Memory;
// LLM can call memory.store(), memory.search()
```

### `@ThinkingLoop(options?)`

Optional decorator that configures the thinking loop and exposes a runtime handle. Without it, you still get a thinking loop with defaults -- this is for customization and runtime control.

```typescript
@ThinkingLoop({
  intervalMs: 5000,        // think every 5s (default: 5000)
  softTimeoutMs: 30000,    // remind LLM about old tasks (default: 30000)
  hardTimeoutMs: 60000,    // force direct invoke (default: 60000)
  contextWindow: 50,       // sliding window size (default: 50)
  innerMonologue: true,    // thinking loop on (default: true)
  maxSleepTicks: 12,       // max sleep duration (default: 12)
  minIntervalMs: 1000,     // fastest thinking (default: 1000)
  maxIntervalMs: 60000,    // slowest thinking (default: 60000)
  maxDefers: 2,            // max defers per task (default: 2)
})
private thinkingLoop!: LLMThinkingLoop;
```

Runtime control:

```typescript
this.thinkingLoop.pause();              // pause thinking
this.thinkingLoop.resume();             // resume
this.thinkingLoop.tick();               // force immediate tick
this.thinkingLoop.intervalMs = 2000;    // speed up
this.thinkingLoop.innerMonologue = false; // switch to classic direct invoke
```

---

## Built-in Thinking Loop Tools

The LLM always has access to these during its thinking loop:

| Tool | Purpose |
|------|---------|
| `respond({ taskId, result })` | Answer a pending task. Resolves the caller's `invoke()` promise. |
| `idle()` | Do nothing this tick. |
| `sleep({ ticks })` | Skip N ticks to save tokens. Wakes early if new tasks arrive. |
| `set_interval({ ms })` | Change thinking speed. Clamped to configured bounds. |
| `defer({ taskId })` | Push a task back to handle later. Max defers per task is configurable. |

These are always available alongside the entity's own `llmCallable` tools and ref/component tools.

### Timeouts

- **Soft timeout** (default 30s) -- the task prompt shows `[URGENT -- waiting Xs]`. The LLM gets a nudge.
- **Hard timeout** (default 60s) -- task is removed from the loop and executed directly via a classic `_invokeInner()` call, guaranteeing a result.

This means `invoke()` never hangs. Worst case, it falls back to direct execution after the hard timeout.

---

## MCP as Entities

Any [MCP](https://modelcontextprotocol.io) server becomes an entity through the CLI. The `interactkit add` command connects to the server, discovers its tools, and generates a fully typed entity file with `@Tool` methods backed by an internal `MCPClientWrapper`.

### Adding MCP Entities via CLI

```bash
# Slack via stdio transport, attached to the Agent entity
interactkit add Slack --mcp-stdio "npx -y @slack/mcp-server" --attach Agent

# GitHub via stdio transport
interactkit add GitHub --mcp-stdio "npx -y @github/mcp-server" --attach Agent

# A server running over HTTP
interactkit add Analytics --mcp-http "http://localhost:3001/mcp" --attach Brain
```

The CLI connects, discovers every tool the server exposes, and writes a typed entity file (e.g., `slack.entity.ts`). The generated file looks like a normal entity:

```typescript
// Generated by: interactkit add Slack --mcp-stdio "npx -y @slack/mcp-server"
@Entity()
class Slack extends BaseEntity {
  private client = new MCPClientWrapper('npx -y @slack/mcp-server');

  @Tool({ description: 'Send a message to a Slack channel' })
  async sendMessage(input: { channel: string; text: string }): Promise<string> {
    return this.client.call('sendMessage', input);
  }

  @Tool({ description: 'List channels' })
  async listChannels(input: {}): Promise<string[]> {
    return this.client.call('listChannels', input);
  }

  // ... one @Tool method per MCP tool
}
```

Use them like any other entity:

```typescript
@Entity({ description: 'LLM-powered decision making' })
class Brain extends LLMEntity {
  @Describe()
  describe() {
    return `You are a helpful assistant.`;
  }

  @Executor()
  private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });

  @Ref() private slack!: Slack;
  @Ref() private github!: GitHub;
  @Ref() private memory!: Memory;
}
```

The LLM can call `slack.sendMessage()`, `github.createIssue()`, `memory.store()`, all the same way.

### CLI Options

```bash
interactkit add <Name> [options]

# Transport (pick one):
  --mcp-stdio <command>       # stdio transport (e.g. "npx -y @slack/mcp-server")
  --mcp-http  <url>           # HTTP transport (e.g. "http://localhost:3001/mcp")

# Wiring:
  --attach <EntityName>       # add as @Component to this entity automatically

# Optional:
  --mcp-header <key=value>    # add header for MCP connection (repeatable)
  --mcp-env <key=value>       # add env var for stdio MCP server (repeatable)
  --detached                  # mark entity as detached (uses remote pubsub from config)
```

---

## Full Example

```typescript
import {
  Entity, BaseEntity, LLMEntity, Component, Ref, Tool,
  Describe, Executor, State, ThinkingLoop, LLMThinkingLoop, type Remote,
} from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

// ── Root orchestrator ──
@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Remote<Brain>;
  @Component() private browser!: Remote<Browser>;
  @Component() private memory!: Remote<Memory>;

  @Tool({ description: 'Chat with the agent' })
  async chat(input: { message: string }): Promise<string> {
    return this.brain.invoke(input);
  }
}

// ── LLM brain with thinking loop ──
@Entity({ description: 'LLM-powered decision making' })
class Brain extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });

  @ThinkingLoop({ intervalMs: 5000 })
  private thinkingLoop!: LLMThinkingLoop;

  @Describe()
  describe() {
    return `You are a ${this.personality} assistant.`;
  }

  @State({ description: 'Personality' })
  private personality = 'curious and helpful';

  // Ref tools are auto-visible to the LLM
  @Ref() private browser!: Remote<Browser>;
  @Ref() private memory!: Remote<Memory>;

  // Own llmCallable tool — LLM can use during thinking
  @Tool({ description: 'Summarize text', llmCallable: true })
  async summarize(input: { text: string }): Promise<string> {
    return `Summary: ${input.text.slice(0, 100)}...`;
  }
}

// ── Capability entities (tools for the LLM) ──
@Entity()
class Browser extends BaseEntity {
  @Describe()
  describe() { return `Headless browser.`; }

  @Tool({ description: 'Search the web' })
  async search(input: { query: string }): Promise<string[]> { /* ... */ }

  @Tool({ description: 'Read a webpage' })
  async read(input: { url: string }): Promise<string> { /* ... */ }
}

@Entity()
class Memory extends BaseEntity {
  @Describe()
  describe() { return `Long-term memory. ${this.memories.length} entries.`; }

  @State({ description: 'Stored memories' })
  private memories: string[] = [];

  @Tool({ description: 'Store information' })
  async store(input: { text: string }): Promise<void> { /* ... */ }

  @Tool({ description: 'Search stored information' })
  async search(input: { query: string }): Promise<string[]> { /* ... */ }
}
```

When you call `agent.chat({ message: "Research TypeScript and save the findings" })`:

1. Task pushed to Brain's thinking loop
2. LLM thinks: "I need to search for TypeScript info"
3. LLM calls `browser_search({ query: "TypeScript" })`
4. LLM calls `memory_store({ text: "TypeScript is..." })`
5. LLM calls `respond(taskId, "I found info about TypeScript and saved it.")`
6. `chat()` promise resolves with the response

Between tasks, the brain's thinking loop continues -- it may reflect, organize memories, or sleep to save tokens.

---

## Build-time Checks

The build catches mistakes early:

- `LLMEntity` subclass without `@Executor`
- `@Describe` method that does not return a string
- `@Tool` missing a description
- `@ThinkingLoop` on a non-`LLMEntity` class
- `@State` properties that aren't `private`

---

## Shared Conversation Context

By default, each `LLMEntity` gets its own private `LLMContext` (and its own thinking loop). When you want multiple brains to share conversation history, use `ConversationContext`:

```typescript
@Entity()
class Agent extends BaseEntity {
  @Component() private context!: Remote<ConversationContext>;
  @Component() private researchBrain!: Remote<ResearchBrain>;
  @Component() private writingBrain!: Remote<WritingBrain>;

  @State({ description: 'Current mode' })
  private mode: 'research' | 'writing' = 'research';

  @Tool({ description: 'Chat' })
  async chat(input: { message: string }): Promise<string> {
    if (this.mode === 'research') return this.researchBrain.invoke(input);
    return this.writingBrain.invoke(input);
  }
}

@Entity({ description: 'Research brain' })
class ResearchBrain extends LLMEntity {
  @Ref() protected override context!: Remote<ConversationContext>;
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private browser!: Remote<Browser>;

  @Describe()
  describe() { return `You are a research assistant.`; }
}
```

Both brains share the same history. The writing brain knows what the research brain found. Each still has its own thinking loop -- shared context is about conversation history, not the thinking loop itself.

---

## Router Pattern (Multiple Brains)

Use separate brain entities for separate concerns. The parent routes based on state. Each brain has its own thinking loop with its own tools -- the entity tree IS the state machine:

```typescript
@Entity()
class SupportAgent extends BaseEntity {
  @Component() private triage!: Remote<TriageBrain>;
  @Component() private billing!: Remote<BillingBrain>;
  @Component() private technical!: Remote<TechnicalBrain>;

  @State({ description: 'Current department' })
  private department: 'triage' | 'billing' | 'technical' = 'triage';

  @Tool({ description: 'Send a message' })
  async chat(input: { message: string }): Promise<string> {
    // invoke() pushes a task to the active brain's thinking loop
    switch (this.department) {
      case 'triage':    return this.triage.invoke(input);
      case 'billing':   return this.billing.invoke(input);
      case 'technical': return this.technical.invoke(input);
    }
  }

  @Tool({ description: 'Route to a department' })
  async route(input: { department: 'triage' | 'billing' | 'technical' }): Promise<void> {
    this.department = input.department;
  }
}

@Entity({ description: 'Classifies issues and routes' })
class TriageBrain extends LLMEntity {
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private agent!: Remote<SupportAgent>;  // LLM can call agent.route()

  @Describe()
  describe() { return `You classify support requests. Route to billing or technical.`; }
}
```

Each brain has its own thinking loop, context, and tools. The triage brain can call `agent_route()` to hand off. Adding a department = adding a brain entity + a switch case.

---

## Context and Memory

The thinking loop uses a sliding context window (default 50 messages). Old messages fall off automatically. For long-term memory, there are two approaches:

### Built-in `LongTermMemory` (RAG)

The SDK ships `LongTermMemory` -- a ready-made entity backed by a `VectorStoreAdapter`. Add it as a `@Component` and the LLM gets semantic memory tools with zero custom code:

```typescript
import { Entity, LLMEntity, Component, Executor, LongTermMemory, type Remote } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity({ description: 'Research agent' })
class ResearchAgent extends LLMEntity {
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o' });
  @Component() private memory!: Remote<LongTermMemory>;
  // LLM sees: memory_memorize(), memory_recall(), memory_forget()
}
```

Configure the vector store globally in `interactkit.config.ts`:

```typescript
import { ChromaDBVectorStoreAdapter } from '@interactkit/chromadb';

export default {
  // ...
  vectorStore: new ChromaDBVectorStoreAdapter({ collection: 'agent-memory' }),
} satisfies InteractKitConfig;
```

The LLM gets three tools:

| Tool | What it does |
|------|-------------|
| `memory_memorize({ content, tags?, metadata? })` | Store a memory with optional tags and metadata |
| `memory_recall({ query, k?, tags?, scoreThreshold? })` | Search by semantic similarity |
| `memory_forget({ ids? })` | Delete specific memories by ID |

Namespace is derived from the entity ID automatically — multiple `LongTermMemory` instances sharing the same vector store are isolated by default. Results include similarity scores and tags for filtering.

**Available adapters:**

| Package | Store | Embeddings |
|---------|-------|------------|
| `@interactkit/chromadb` | ChromaDB | Built-in (zero config) |
| `@interactkit/pinecone` | Pinecone | Bring your own (`embed` fn or LangChain `Embeddings`) |
| `@interactkit/langchain` | Any LangChain VectorStore | Whatever the store uses |

Or implement `VectorStoreAdapter` yourself -- it's three methods (`add`, `search`, `delete`). See [Infrastructure](./infrastructure.md#vector-store).

**Shared memory** across multiple LLM entities works the same way as `ConversationContext`:

```typescript
@Entity()
class AgentHub extends BaseEntity {
  @Component() private memory!: Remote<LongTermMemory>;
  @Component() private researcher!: Remote<ResearchAgent>;
  @Component() private writer!: Remote<WriterAgent>;
}

class ResearchAgent extends LLMEntity {
  @Ref() private memory!: Remote<LongTermMemory>;
  // Both agents share the same memory store
}
```

### Custom Memory Entity

For full control, write your own memory entity. This is useful when you need custom indexing, expiration, or non-vector storage:

```typescript
@Entity({ description: 'Custom memory' })
class Memory extends BaseEntity {
  @State({ description: 'Stored memories' })
  private memories: string[] = [];

  @Describe()
  describe() { return `${this.memories.length} memories stored.`; }

  @Tool({ description: 'Remember something important' })
  async remember(input: { text: string }): Promise<void> {
    this.memories.unshift(input.text);
    if (this.memories.length > 20) this.memories.pop();
  }

  @Tool({ description: 'Recall memories matching a query' })
  async recall(input: { query: string }): Promise<string[]> { /* ... */ }
}

@Entity({ description: 'An NPC' })
class Npc extends LLMEntity {
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Component() private memory!: Remote<Memory>;  // LLM sees memory_remember(), memory_recall()
}
```

**Why a component, not own methods?** Own `@Tool` methods on an `LLMEntity` are external-facing by default (other entities call them). To make them LLM-visible you'd need `llmCallable: true`. A separate component avoids this and keeps the pattern clean: tools = capabilities, components = the LLM's toolkit.

### Context Window

To customize the context window, use `@ThinkingLoop({ contextWindow: 100 })` or override the context directly:

```typescript
protected context = new LLMContext({ maxHistory: 200 });
```

---

## Observability

### Streams

Every `LLMEntity` exposes `response` and `toolCall` streams that parents can subscribe to:

```typescript
this.brain.response.on('data', (text: string) => { /* LLM spoke */ });
this.brain.toolCall.on('data', (event: ToolCallEvent) => { /* tool used */ });
```

### Thinking Loop Events

If you have a `@ThinkingLoop` handle, subscribe to events directly:

```typescript
this.thinkingLoop.on((event) => {
  switch (event.type) {
    case 'tick':        // { tickNumber, pending, durationMs }
    case 'respond':     // { taskId, message, result, latencyMs }
    case 'thought':     // { content } -- inner monologue text
    case 'timeout':     // { taskId, kind: 'soft'|'hard', elapsedMs }
    case 'task_pushed': // { taskId, message, pending }
    case 'idle':        // { tickNumber }
    case 'error':       // { error }
  }
});
```

### Observer Integration

All thinking loop events flow through the observer pipeline automatically. The `DevObserver` renders them in the terminal:

```
21:50:03 ◆ npc tick #12 (2 pending, 1.8s)
21:50:05 ◆ npc respond [abc123] (3200ms)
21:50:05 ◆ npc inner thought: "I should head to the entrance..."
21:50:08 ◆ npc task pushed [def456] (1 pending)
21:50:38 ◆ npc soft timeout [def456] (30012ms)
```

Event types are prefixed with `thinkingLoop.` (e.g. `thinkingLoop.tick`, `thinkingLoop.respond`).

---

## What's Next?

- [Hooks](./hooks.md): make entities act on their own with timers, schedules, and events
- [Extensions](./extensions.md): custom hook types and MCP servers as packages
