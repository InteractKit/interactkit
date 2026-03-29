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

## What Happens When You Call `invoke()`

```
You: brain.invoke({ message: "Find info about TypeScript and save it" })

1. Message added to conversation context
2. LLM sees all available tools (own @Tool methods + ref/component tools)
3. LLM calls browser.search({ query: "TypeScript" })
4. Result goes back to LLM
5. LLM calls memory.store({ text: "TypeScript is..." })
6. Result goes back to LLM
7. LLM returns: "I found info about TypeScript and saved it to memory."
```

This tool-call loop runs automatically until the LLM gives a final text answer.

---

## `LLMEntity` Base Class

Extend `LLMEntity` instead of `BaseEntity` to get LLM capabilities. `LLMEntity` itself extends `BaseEntity`, so all standard entity features (state, components, hooks, streams) still work.

What you get out of the box:

| Built-in | Description |
|----------|-------------|
| `invoke(params)` | Send a message to the LLM and get a response. Runs the full tool-call loop. |
| `context` | `protected context = new LLMContext()` -- conversation history, automatically managed. |
| `response` stream | `EntityStream<string>` -- emits each final LLM response. |
| `toolCall` stream | `EntityStream<ToolCallEvent>` -- emits each tool call with `{ tool, args, result }`. |

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

### `@Tool({ description })`

Makes a method callable by the LLM:

```typescript
@Tool({ description: 'Send an email' })
async sendEmail(input: { to: string; subject: string; body: string }): Promise<string> {
  return 'Sent!';
}
```

The description is what the LLM reads to decide whether to use this tool. Make it clear.

### `@Ref()` and `@Component()`

On an `LLMEntity`, all refs and components are automatically visible to the LLM. Their `@Tool` methods become available tools:

```typescript
@Ref() private browser!: Browser;
// LLM can call browser.search(), browser.read()

@Component() private memory!: Memory;
// LLM can call memory.store(), memory.search()
```

No extra annotation needed. Just declare the ref or component and its tools are there.

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
import { Entity, BaseEntity, LLMEntity, Component, Ref, Tool, Describe, Executor, State } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private browser!: Browser;
  @Component() private memory!: Memory;
  @Component() private slack!: Slack;

  @Tool({ description: 'Chat with the agent' })
  async chat(input: { message: string }): Promise<string> {
    return this.brain.invoke(input);
  }
}

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
  @Ref() private slack!: Slack;

  @State({ description: 'Personality' })
  private personality = 'curious and helpful';
}

@Entity()
class Browser extends BaseEntity {
  @Describe()
  describe() {
    return `Headless browser. Cache has ${this.cacheSize} pages.`;
  }

  @Tool({ description: 'Search the web' })
  async search(input: { query: string }): Promise<string[]> { /* ... */ }

  @Tool({ description: 'Read a webpage' })
  async read(input: { url: string }): Promise<string> { /* ... */ }
}

@Entity()
class Memory extends BaseEntity {
  @Describe()
  describe() {
    return `Long-term memory store. ${this.entryCount} entries indexed.`;
  }

  @Tool({ description: 'Store information' })
  async store(input: { text: string }): Promise<void> { /* ... */ }

  @Tool({ description: 'Search stored information' })
  async search(input: { query: string }): Promise<string[]> { /* ... */ }
}

// Generated by: interactkit add Slack --mcp-stdio "npx -y @slack/mcp-server"
@Entity()
class Slack extends BaseEntity {
  private client = new MCPClientWrapper('npx -y @slack/mcp-server');

  @Tool({ description: 'Send a message to a Slack channel' })
  async sendMessage(input: { channel: string; text: string }): Promise<string> {
    return this.client.call('sendMessage', input);
  }
}
```

Now `agent.chat({ message: "Research TypeScript, save the best findings, and post a summary to #engineering" })` and the LLM handles the rest.

---

## Build-time Checks

The build catches mistakes early:

- `LLMEntity` subclass without `@Executor`
- `@Describe` method that does not return a string
- `@Tool` missing a description

---

## Shared Conversation Context

By default, each `LLMEntity` gets its own private `LLMContext`. When you want multiple brains to share the same conversation history, use `ConversationContext` -- an entity that wraps `LLMContext` and can be referenced by any number of `LLMEntity` siblings.

The parent owns the shared context as a `@Component`. Each brain overrides its built-in `context` with a `@Ref` to the shared one:

```typescript
import { Entity, BaseEntity, LLMEntity, Component, Ref, Tool, Describe, Executor, State, ConversationContext } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity()
class Agent extends BaseEntity {
  @Component() private context!: ConversationContext;
  @Component() private researchBrain!: ResearchBrain;
  @Component() private writingBrain!: WritingBrain;

  @State({ description: 'Current mode' })
  private mode: 'research' | 'writing' = 'research';

  @Tool({ description: 'Chat with the agent' })
  async chat(input: { message: string }): Promise<string> {
    if (this.mode === 'research') return this.researchBrain.invoke(input);
    return this.writingBrain.invoke(input);
  }
}

@Entity({ description: 'Research assistant brain' })
class ResearchBrain extends LLMEntity {
  @Ref() protected override context!: ConversationContext;
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private browser!: Browser;
  @Ref() private memory!: Memory;

  @Describe()
  describe() {
    return `You are a research assistant. Search the web and save findings.`;
  }
}

@Entity({ description: 'Writing assistant brain' })
class WritingBrain extends LLMEntity {
  @Ref() protected override context!: ConversationContext;
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private memory!: Memory;

  @Describe()
  describe() {
    return `You are a writer. Use memories to draft content.`;
  }
}
```

Switching modes preserves the full conversation. Both brains read from and write to the same history, so the writing brain knows what the research brain found and vice versa. The user gets a seamless experience -- they do not need to repeat themselves when the mode changes.

---

## Router Pattern (Multiple Brains)

Instead of one brain with phases or flags controlling which tools are visible, use separate brain entities for separate concerns. The parent entity routes messages based on state. The entity tree IS the state machine:

```typescript
import { Entity, BaseEntity, LLMEntity, Component, Ref, Tool, Describe, Executor, State } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity()
class SupportAgent extends BaseEntity {
  @Component() private triage!: TriageBrain;
  @Component() private billing!: BillingBrain;
  @Component() private technical!: TechnicalBrain;

  @State({ description: 'Current department handling the conversation' })
  private department: 'triage' | 'billing' | 'technical' = 'triage';

  @Tool({ description: 'Send a message to the support agent' })
  async chat(input: { message: string }): Promise<string> {
    switch (this.department) {
      case 'triage':    return this.triage.invoke(input);
      case 'billing':   return this.billing.invoke(input);
      case 'technical': return this.technical.invoke(input);
    }
  }

  @Tool({ description: 'Route to a different department' })
  async route(input: { department: 'triage' | 'billing' | 'technical' }): Promise<void> {
    this.department = input.department;
  }
}

@Entity({ description: 'Triage brain -- classifies issues and routes' })
class TriageBrain extends LLMEntity {
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private agent!: SupportAgent;

  @Describe()
  describe() {
    return `You classify support requests. Route to billing or technical.`;
  }
}

@Entity({ description: 'Billing brain -- handles payment and account issues' })
class BillingBrain extends LLMEntity {
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private payments!: PaymentSystem;

  @Describe()
  describe() {
    return `You handle billing issues. Use tools to look up invoices and process refunds.`;
  }
}

@Entity({ description: 'Technical brain -- handles product and engineering issues' })
class TechnicalBrain extends LLMEntity {
  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private docs!: DocSearch;
  @Ref() private tickets!: TicketSystem;

  @Describe()
  describe() {
    return `You handle technical issues. Search docs and create tickets when needed.`;
  }
}
```

Each brain has exactly the tools it needs -- no if/else gating, no tool visibility flags. The triage brain can call `agent.route()` to hand off, and the parent starts sending messages to the new brain. Adding a new department is just adding a new brain entity and a new case in the switch.

---

## Custom Context

Every `LLMEntity` has a built-in `protected context = new LLMContext()`. Override it to configure history limits:

```typescript
import { Entity, LLMEntity, LLMContext, Describe, Executor } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@Entity({ description: 'Brain with custom context settings' })
class Brain extends LLMEntity {
  protected context = new LLMContext({ maxHistory: 200 });

  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });

  @Describe()
  describe() {
    return `You are a helpful assistant with a long memory.`;
  }
}
```

The default `maxHistory` is 50 messages. Increase it for long-running conversations, or decrease it to save tokens on context-sensitive tasks.

You can also combine this with `ConversationContext` for shared history with custom limits:

```typescript
import { Entity, BaseEntity, Component, Hook, Init, ConversationContext } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() private context!: ConversationContext;
  @Component() private brain!: Brain;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    this.context.configure({ maxHistory: 200 });
  }
}
```

---

## Observability with Streams

Every `LLMEntity` exposes `response` and `toolCall` streams. Parents can subscribe to these for logging, cost tracking, debugging, or driving a UI:

```typescript
import { Entity, BaseEntity, Component, State, Hook, Init, Tool } from '@interactkit/sdk';
import type { ToolCallEvent } from '@interactkit/sdk';

@Entity()
class Dashboard extends BaseEntity {
  @Component() private brain!: Brain;

  @State({ description: 'Total tool calls executed' })
  private toolCallCount = 0;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    // Log every tool call with timestamp
    this.brain.toolCall.on('data', (event: ToolCallEvent) => {
      this.toolCallCount++;
      console.log(`[${new Date().toISOString()}] tool #${this.toolCallCount}: ${event.tool} → ${event.result.slice(0, 50)}...`);
    });

    // Log every final LLM response
    this.brain.response.on('data', (text: string) => {
      console.log(`[${new Date().toISOString()}] response: ${text.slice(0, 100)}...`);
    });
  }

  @Tool({ description: 'Get total tool calls executed' })
  async getToolCallCount(): Promise<number> {
    return this.toolCallCount;
  }
}
```

This works because streams are always public -- the parent accesses `this.brain.toolCall` and `this.brain.response` directly through the component proxy. The brain itself does not need any extra code; the streams are built into `LLMEntity`.

Use cases:
- **Logging**: write structured tool call logs to a file or external service.
- **Cost tracking**: count tokens or tool invocations per conversation.
- **UI updates**: push real-time status to a frontend (e.g., "Searching the web..." when a tool call starts).
- **Debugging**: trace exactly what the LLM decided to do and what results it got back.

---

## What's Next?

- [Hooks](./hooks.md): make entities act on their own with timers, schedules, and events
- [Extensions](./extensions.md): custom hook types and MCP servers as packages
