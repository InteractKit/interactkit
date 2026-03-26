# LLM Entities

An LLM entity is an entity with a brain. It extends `LLMEntity` instead of `BaseEntity`, giving it a built-in `invoke()` method, conversation context, and observable streams. All `@Ref` siblings and `@Component` children automatically have their `@Tool` methods exposed to the LLM.

## The Pattern

You have entities that each do one thing:

```typescript
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
@Entity({ description: 'LLM-powered decision making' })
class Brain extends LLMEntity {
  @SystemPrompt()
  private get systemPrompt() {
    return `You are a ${this.personality} assistant.`;
  }

  @Executor()
  private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });

  @Ref() private browser!: Browser;
  @Ref() private memory!: Memory;

  @Tool({ description: 'Summarize text' })
  async summarize(input: { text: string }): Promise<string> {
    return `Summary: ${input.text.slice(0, 100)}...`;
  }
}
```

The LLM now has access to: `browser.search()`, `browser.read()`, `memory.store()`, `memory.search()`, and `summarize()`. No glue code needed. All refs and state are visible to the LLM by default on `LLMEntity` -- no explicit `@LLMVisible()` annotation required.

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
class Agent extends BaseEntity {
  @Component() private brain!: Brain;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    // Watch every LLM response
    this.brain.response.on('data', (text: unknown) => {
      console.log('LLM said:', text);
    });

    // Watch every tool call
    this.brain.toolCall.on('data', (event: unknown) => {
      const { tool, args, result } = event as ToolCallEvent;
      console.log(`Tool called: ${tool}`, args, result);
    });
  }
}
```

---

## The Decorators

### `@SystemPrompt()`

Marks a string property or getter as the system prompt. Evaluated before each LLM invocation, so it can include dynamic state:

```typescript
@SystemPrompt()
private get systemPrompt() {
  return `You are a ${this.personality} assistant. Current mood: ${this.mood}.`;
}
```

Or a static string property:

```typescript
@SystemPrompt()
private systemPrompt = 'You are a helpful assistant.';
```

### `@Executor()`

Points to your LLM model. Any LangChain `BaseChatModel` works:

```typescript
@Executor() private llm = new ChatOpenAI({ model: 'gpt-4' });
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

Any [MCP](https://modelcontextprotocol.io) server becomes an entity. `@MCP` connects to the server at boot, discovers its tools, and registers them as `@Tool` methods, so they are picked up automatically when referenced from an `LLMEntity`.

```typescript
@MCP({
  transport: { type: 'http', url: 'http://localhost:3001/mcp' },
})
@Entity()
class SlackMCP extends BaseEntity {}

@MCP({
  transport: { type: 'stdio', command: 'npx', args: ['-y', '@github/mcp-server'] },
})
@Entity()
class GitHubMCP extends BaseEntity {}
```

Use them like any other entity:

```typescript
@Entity({ description: 'LLM-powered decision making' })
class Brain extends LLMEntity {
  @SystemPrompt()
  private systemPrompt = 'You are a helpful assistant.';

  @Executor()
  private llm = new ChatOpenAI({ model: 'gpt-4' });

  @Ref() private slack!: SlackMCP;
  @Ref() private github!: GitHubMCP;
  @Ref() private memory!: Memory;
}
```

The LLM can call `slack.sendMessage()`, `github.createIssue()`, `memory.store()`, all the same way.

### `@MCP` Options

```typescript
@MCP({
  // Transport: how to connect
  transport:
    | { type: 'http', url: string, headers?: Record<string, string> }
    | { type: 'sse', url: string, headers?: Record<string, string> }
    | { type: 'stdio', command: string, args?: string[], env?: Record<string, string>, cwd?: string },

  // Optional
  tools?: string[],          // only expose these tools (default: all)
  toolPrefix?: string,       // prefix tool names (default: entity property name)
  connectTimeout?: number,   // ms (default: 10000)
  callTimeout?: number,      // ms (default: 30000)
  retryOnFailure?: boolean,  // retry on connect failure (default: true)
  maxRetries?: number,       // retry attempts (default: 3)
})
```

---

## Full Example

```typescript
@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private browser!: Browser;
  @Component() private memory!: Memory;
  @Component() private slack!: SlackMCP;

  @Tool({ description: 'Chat with the agent' })
  async chat(input: { message: string }): Promise<string> {
    return this.brain.invoke(input);
  }
}

@Entity({ description: 'LLM-powered decision making' })
class Brain extends LLMEntity {
  @SystemPrompt()
  private get systemPrompt() {
    return `You are a curious and helpful assistant.`;
  }

  @Executor()
  private llm = new ChatOpenAI({ model: 'gpt-4' });

  @Ref() private browser!: Browser;
  @Ref() private memory!: Memory;
  @Ref() private slack!: SlackMCP;

  @State({ description: 'Personality' })
  private personality = 'curious and helpful';
}

@Entity()
class Browser extends BaseEntity {
  @Tool({ description: 'Search the web' })
  async search(input: { query: string }): Promise<string[]> { /* ... */ }

  @Tool({ description: 'Read a webpage' })
  async read(input: { url: string }): Promise<string> { /* ... */ }
}

@Entity()
class Memory extends BaseEntity {
  @Tool({ description: 'Store information' })
  async store(input: { text: string }): Promise<void> { /* ... */ }

  @Tool({ description: 'Search stored information' })
  async search(input: { query: string }): Promise<string[]> { /* ... */ }
}

@MCP({
  transport: { type: 'http', url: 'http://localhost:3001/mcp' },
})
@Entity()
class SlackMCP extends BaseEntity {}
```

Now `agent.chat({ message: "Research TypeScript, save the best findings, and post a summary to #engineering" })` and the LLM handles the rest.

---

## Build-time Checks

The build catches mistakes early:

- `LLMEntity` subclass without `@Executor`
- `@SystemPrompt` on a non-`LLMEntity` class
- `@Tool` missing a description
- `@MCP` without a transport config

---

## Shared Conversation Context

By default, each `LLMEntity` gets its own private `LLMContext`. When you want multiple brains to share the same conversation history, use `ConversationContext` -- an entity that wraps `LLMContext` and can be referenced by any number of `LLMEntity` siblings.

The parent owns the shared context as a `@Component`. Each brain overrides its built-in `context` with a `@Ref` to the shared one:

```typescript
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
  @Executor() private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  @Ref() private browser!: Browser;
  @Ref() private memory!: Memory;

  @SystemPrompt()
  private systemPrompt = 'You are a research assistant. Search the web and save findings.';
}

@Entity({ description: 'Writing assistant brain' })
class WritingBrain extends LLMEntity {
  @Ref() protected override context!: ConversationContext;
  @Executor() private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  @Ref() private memory!: Memory;

  @SystemPrompt()
  private systemPrompt = 'You are a writer. Use memories to draft content.';
}
```

Switching modes preserves the full conversation. Both brains read from and write to the same history, so the writing brain knows what the research brain found and vice versa. The user gets a seamless experience -- they do not need to repeat themselves when the mode changes.

---

## Router Pattern (Multiple Brains)

Instead of one brain with phases or flags controlling which tools are visible, use separate brain entities for separate concerns. The parent entity routes messages based on state. The entity tree IS the state machine:

```typescript
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
  @Executor() private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  @Ref() private agent!: SupportAgent;

  @SystemPrompt()
  private systemPrompt = 'You classify support requests. Route to billing or technical.';
}

@Entity({ description: 'Billing brain -- handles payment and account issues' })
class BillingBrain extends LLMEntity {
  @Executor() private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  @Ref() private payments!: PaymentSystem;

  @SystemPrompt()
  private systemPrompt = 'You handle billing issues. Use tools to look up invoices and process refunds.';
}

@Entity({ description: 'Technical brain -- handles product and engineering issues' })
class TechnicalBrain extends LLMEntity {
  @Executor() private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });
  @Ref() private docs!: DocSearch;
  @Ref() private tickets!: TicketSystem;

  @SystemPrompt()
  private systemPrompt = 'You handle technical issues. Search docs and create tickets when needed.';
}
```

Each brain has exactly the tools it needs -- no if/else gating, no tool visibility flags. The triage brain can call `agent.route()` to hand off, and the parent starts sending messages to the new brain. Adding a new department is just adding a new brain entity and a new case in the switch.

---

## Custom Context

Every `LLMEntity` has a built-in `protected context = new LLMContext()`. Override it to configure history limits or set a default system prompt directly on the context:

```typescript
@Entity({ description: 'Brain with custom context settings' })
class Brain extends LLMEntity {
  protected context = new LLMContext({ maxHistory: 200 });

  @Executor() private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });

  @SystemPrompt()
  private systemPrompt = 'You are a helpful assistant with a long memory.';
}
```

The default `maxHistory` is 50 messages. Increase it for long-running conversations, or decrease it to save tokens on context-sensitive tasks.

You can also combine this with `ConversationContext` for shared history with custom limits:

```typescript
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
@Entity()
class Dashboard extends BaseEntity {
  @Component() private brain!: Brain;

  @State({ description: 'Total tool calls executed' })
  private toolCallCount = 0;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    // Log every tool call with timestamp
    this.brain.toolCall.on('data', (event: unknown) => {
      const { tool, args, result } = event as ToolCallEvent;
      this.toolCallCount++;
      console.log(`[${new Date().toISOString()}] tool #${this.toolCallCount}: ${tool} → ${result.slice(0, 50)}...`);
    });

    // Log every final LLM response
    this.brain.response.on('data', (text: unknown) => {
      console.log(`[${new Date().toISOString()}] response: ${(text as string).slice(0, 100)}...`);
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
