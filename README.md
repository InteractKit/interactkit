# InteractKit

**Build LLM agents in TypeScript with classes, not glue code.**

This is a complete customer support agent with memory, Slack integration, and ticket management:

```typescript
@Entity()
class SupportAgent extends BaseEntity {
  @Component() private brain!: SupportBrain;
  @Component() private memory!: Memory;
  @Component() private slack!: SlackMCP;
  @Component() private tickets!: TicketsMCP;
}

@Entity()
class SupportBrain extends LLMEntity {
  @State({ description: 'Product the agent specializes in' })
  private product = 'InteractKit';

  @SystemPrompt()
  private get systemPrompt() {
    return `You are a support agent for ${this.product}. Look up past conversations
    before answering. Create tickets for bugs. Escalate billing issues to Slack.`;
  }

  @Executor() private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });

  @Ref() private memory!: Memory;   // brain sees memory.store(), memory.search()
  @Ref() private slack!: SlackMCP;   // brain sees slack.sendMessage(), etc.
  @Ref() private tickets!: TicketsMCP; // brain sees tickets.create(), etc.
}

@Entity()
class Memory extends BaseEntity {
  @State({ description: 'Stored entries' })
  private entries: string[] = [];

  @Tool({ description: 'Store something for later' })
  async store(input: { text: string }) { this.entries.push(input.text); }

  @Tool({ description: 'Search stored entries' })
  async search(input: { query: string }) {
    return this.entries.filter(e => e.includes(input.query));
  }
}

@MCP({ transport: { type: 'stdio', command: 'npx', args: ['-y', '@slack/mcp-server'] } })
@Entity()
class SlackMCP extends BaseEntity {}

@MCP({ transport: { type: 'http', url: 'https://tickets.internal/mcp' } })
@Entity()
class TicketsMCP extends BaseEntity {}
```

That is a working agent. The Brain sees every sibling's tools automatically. `@Ref` wires them. `@MCP` turns external servers into entities. Call `brain.invoke({ message: 'user says: I was double-charged' })` and the LLM searches memory, creates a ticket, and pings #billing on Slack -- on its own.

---

## What You Don't Write

InteractKit eliminates the boilerplate that dominates LLM agent code:

| You write | InteractKit handles |
|-----------|-------------------|
| `@Tool({ description: '...' })` on a method | Tool JSON schemas (extracted from TypeScript types at build time) |
| `@Ref() private memory!: Memory` | Tool routing, registration, and invocation wiring |
| `@State({ description: '...' })` on a property | Persistence, hydration, serialization across restarts |
| `@SystemPrompt()` on a getter | Conversation history, message formatting, tool call loops |
| `@MCP({ transport: ... })` on a class | MCP connection, tool discovery, protocol handling |
| `@Component()` on children | Entity lifecycle, dependency injection, event bus routing |

No `tool_schemas.json`. No `registerTool()`. No manual `while (hasToolCalls)` loops. No state serialization. The framework reads your TypeScript types and generates everything at build time.

---

## How It Looks

A research agent with HTTP API, LLM brain, persistent memory, and real-time observability:

```typescript
@Entity()
class ResearchAgent extends BaseEntity {
  @Component() private brain!: ResearchBrain;
  @Component() private memory!: Memory;
  @Component() private browser!: Browser;

  @Hook(Init.Runner())
  async onInit() {
    // Stream every tool call and response in real time
    this.brain.toolCall.on('data', (tc) => console.log(`[tool] ${tc.tool}(${JSON.stringify(tc.args)})`));
    this.brain.response.on('data', (text) => console.log(`[response] ${text}`));
  }

  @Hook(HttpRequest.Runner({ port: 3000, path: '/research' }))
  async onRequest(input: HttpRequest.Input) {
    const { topic } = JSON.parse(input.body);
    const result = await this.brain.invoke({ message: `Research: ${topic}` });
    input.respond(200, JSON.stringify({ result }));
  }
}

@Entity()
class ResearchBrain extends LLMEntity {
  @State({ description: 'Areas of expertise' })
  private expertise: string[] = ['computer science', 'economics'];

  @SystemPrompt()
  private get systemPrompt() {
    return `You are a research assistant specializing in: ${this.expertise.join(', ')}.
    Search the web for current information. Store key findings in memory for later.`;
  }

  @Executor() private llm = new ChatAnthropic({ model: 'claude-sonnet-4-20250514' });

  @Ref() private memory!: Memory;   // sees memory.store(), memory.search()
  @Ref() private browser!: Browser;  // sees browser.search(), browser.read()
}
```

`curl localhost:3000/research -d '{"topic":"quantum computing"}'` — the LLM searches the web, reads pages, stores findings, and returns a synthesized answer. The parent streams every tool call in real time.

---

## The Entity Tree Is Your Architecture

Agents are just entity trees. The tree is the architecture diagram:

```
SupportTeam
  ├── Router (LLM)               ← triages incoming requests
  ├── TechSupport                 ← handles technical issues
  │   ├── TechBrain (LLM)
  │   ├── Docs
  │   └── Memory
  ├── BillingSupport              ← handles billing issues
  │   ├── BillingBrain (LLM)
  │   ├── Stripe (MCP)
  │   └── Memory
  └── SharedContext               ← conversation history shared across all brains
```

Every box is an entity class. `LLMEntity` classes get an LLM. `@MCP` classes wrap external servers. `@Ref` lets siblings call each other. `ConversationContext` shares history across multiple brains. The tree defines who can talk to whom -- no configuration files, no routing tables.

## Quick Start

```bash
interactkit init my-agent    # pick a template + database
cd my-agent
pnpm install
pnpm dev                     # builds, runs, watches for changes
```

Add your LLM API key to `.env`, uncomment the executor import, and you're running.

## Features

- **`LLMEntity` base class.** Extend it, add `@Executor` and `@SystemPrompt`, and you get `invoke()`, conversation history, and tool-call loops for free. No manual orchestration.
- **`@Ref` for tool wiring.** Point at a sibling entity and the LLM sees all its tools. No registration, no schemas, no glue.
- **`@MCP` for external servers.** Any MCP server becomes an entity with one decorator. Slack, GitHub, databases -- the LLM calls their tools like any other.
- **`@Stream` for observability.** `brain.response` and `brain.toolCall` are built-in streams. Parents subscribe to children. Real-time, typed, no polling.
- **`ConversationContext` sharing.** Multiple LLM brains share a single conversation history. The router knows what the specialist said.
- **Dynamic `@SystemPrompt`.** Use a getter that reads entity state. The prompt updates every invocation -- personality, expertise, user preferences, all live.
- **`@Hook` for autonomy.** Timers, cron schedules, event listeners. Entities act on their own, not just when called.
- **Persistent `@State`.** Every state property is saved to the database automatically. Survives restarts. No serialization code.
- **Any LangChain model.** `ChatAnthropic`, `ChatOpenAI`, `ChatGoogleGenerativeAI`, or any `BaseChatModel`.
- **Scales when you need it.** Swap `InProcessBusAdapter` for `RedisPubSubAdapter` and entities communicate across processes.

## Docs

| Guide | What you'll learn |
|-------|-------------------|
| [Why InteractKit](https://github.com/InteractKit/interactkit/blob/main/docs/why.md) | The big picture and what it unlocks |
| [Getting Started](https://github.com/InteractKit/interactkit/blob/main/docs/getting-started.md) | Build your first agent in 5 minutes |
| [Entities](https://github.com/InteractKit/interactkit/blob/main/docs/entities.md) | State, tools, children, refs, streams |
| [LLM Entities](https://github.com/InteractKit/interactkit/blob/main/docs/llm.md) | Giving entities an LLM brain |
| [Hooks](https://github.com/InteractKit/interactkit/blob/main/docs/hooks.md) | Timers, schedules, events |
| [Infrastructure](https://github.com/InteractKit/interactkit/blob/main/docs/infrastructure.md) | Database, pub/sub, logging |
| [Deployment](https://github.com/InteractKit/interactkit/blob/main/docs/deployment.md) | Scaling your agents |
| [Codegen](https://github.com/InteractKit/interactkit/blob/main/docs/codegen.md) | What the build generates |
| [Testing](https://github.com/InteractKit/interactkit/blob/main/docs/testing.md) | bootTest, mockLLM, mockEntity |
| [Extensions](https://github.com/InteractKit/interactkit/blob/main/docs/extensions.md) | Custom integrations |

## Packages

| Package | Description |
|---------|-------------|
| [`@interactkit/sdk`](https://github.com/InteractKit/interactkit/tree/main/sdk) | Core SDK: decorators, runtime, LLM + MCP integration |
| [`@interactkit/cli`](https://github.com/InteractKit/interactkit/tree/main/cli) | CLI: init, add, build, dev, start |

### Extensions

| Package | Description |
|---------|-------------|
| [`@interactkit/http`](https://github.com/InteractKit/interactkit/tree/main/extensions/http) | `HttpRequest` hook — spins up an HTTP server, fires on incoming requests |
| [`@interactkit/websocket`](https://github.com/InteractKit/interactkit/tree/main/extensions/websocket) | `WsMessage` + `WsConnection` hooks — WebSocket server, fires on messages/connects |

Extensions export hook namespaces. Attach them to your own entities with `@Hook(HttpRequest.Runner({ port: 3100 }))`.

See [sample-app](https://github.com/InteractKit/interactkit/tree/main/examples/sample-app) for a full working example.
