# InteractKit

**TypeScript framework for building LLM agents that actually scale.**

Most agent frameworks give you a function and a prompt. InteractKit gives you an architecture. Your agents are class trees, your tools are methods, your state persists automatically, and MCP servers become typed entities with one CLI command.

```bash
npx @interactkit/cli init my-agent
cd my-agent && pnpm install && pnpm dev
```

---

## 30-second Example

A support agent with memory, Slack, and ticket management -- four entities, zero glue code:

```typescript
@Entity()
class SupportAgent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private memory!: Memory;
  @Component() private slack!: Slack;      // generated from MCP server
  @Component() private tickets!: Tickets;  // generated from MCP server

  @Describe()
  describe() { return 'Support agent. Delegates to brain for all queries.'; }

  @Hook(HttpRequest.Runner({ port: 3000, path: '/chat' }))
  async onChat(input: HttpRequest.Input) {
    const { message } = JSON.parse(input.body);
    const result = await this.brain.invoke({ message });
    input.respond(200, JSON.stringify({ result }));
  }
}

@Entity()
class Brain extends LLMEntity {
  @Describe()
  describe() {
    return `You are a support agent. Look up past conversations before answering.
    Create tickets for bugs. Escalate billing issues to Slack.`;
  }

  @Executor() private llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
  @Ref() private memory!: Memory;
  @Ref() private slack!: Slack;
  @Ref() private tickets!: Tickets;
}

@Entity()
class Memory extends BaseEntity {
  @State({ description: 'Stored entries' })
  private entries: string[] = [];

  @Describe()
  describe() { return `Memory with ${this.entries.length} entries.`; }

  @Tool({ description: 'Store something' })
  async store(input: { text: string }) { this.entries.push(input.text); }

  @Tool({ description: 'Search entries' })
  async search(input: { query: string }) {
    return this.entries.filter(e => e.includes(input.query));
  }
}
```

The Slack and Tickets entities? Generated from MCP servers:

```bash
interactkit add Slack --mcp-stdio "npx -y @slack/mcp-server" --attach SupportAgent
interactkit add Tickets --mcp-http "https://tickets.internal/mcp" --attach SupportAgent
```

The CLI connects, discovers every tool, and writes typed `.ts` files. The Brain sees all sibling tools automatically via `@Ref`. Call `brain.invoke(...)` and the LLM searches memory, creates tickets, and pings Slack -- no orchestration code.

---

## What Makes This Different

**The system prompt writes itself.** Every entity has a `@Describe()` method that returns its current state. The LLM's context is auto-composed:

```
You are a support agent. Look up past conversations before answering.
Create tickets for bugs. Escalate billing issues to Slack.

[memory] Memory with 47 entries.
[slack] Slack integration with 12 tools.
[tickets] Ticket system with 8 tools.
```

This updates on every invocation. When memory grows from 47 to 48 entries, the LLM knows.

**MCP servers become code you own.** Instead of runtime discovery, the CLI generates a real `.ts` file for each MCP server. You can inspect every tool, edit descriptions, remove tools you don't want, and get full type safety.

**The entity tree is the architecture.** No config files, no routing tables, no dependency injection containers. The class hierarchy defines who talks to whom:

```
SupportTeam
  ├── Router (LLM)               <- triages requests
  ├── TechSupport
  │   ├── TechBrain (LLM)
  │   ├── Docs
  │   └── Memory
  ├── BillingSupport
  │   ├── BillingBrain (LLM)
  │   ├── Stripe (MCP)
  │   └── Memory
  └── SharedContext               <- shared history across all brains
```

---

## What You Don't Write

| You write | Framework handles |
|-----------|-------------------|
| `@Tool({ description })` on a method | JSON schemas from TypeScript types |
| `@Ref() private memory!: Memory` | Tool routing and invocation |
| `@State({ description })` on a property | Database persistence across restarts |
| `@Describe()` method | Auto-composed system prompt |
| `interactkit add --mcp-stdio "..."` | MCP discovery + typed entity generation |
| `@Component()` on children | Lifecycle, wiring, event bus |

No `tool_schemas.json`. No `registerTool()`. No `while (hasToolCalls)` loops. No state serialization.

---

## Getting Started

```bash
npx @interactkit/cli init my-agent    # pick template + database
cd my-agent
pnpm install
pnpm dev                              # builds, runs, watches, colored logs
```

Add `OPENAI_API_KEY` to `.env`. That's it.

### Add entities

```bash
interactkit add Memory --attach Agent                           # plain entity
interactkit add Brain --llm --attach Agent                      # LLM entity
interactkit add Slack --mcp-stdio "npx -y @slack/mcp" --attach Agent  # from MCP server
```

### Add MCP servers with auth

```bash
# Headers for HTTP servers
interactkit add Jira --mcp-http "https://jira.internal/mcp" \
  --mcp-header "Authorization=Bearer sk-xxx"

# Env vars for stdio servers
interactkit add GitHub --mcp-stdio "npx -y @github/mcp-server" \
  --mcp-env "GITHUB_TOKEN=ghp_xxx"
```

---

## Core Concepts

### `@Describe()` -- Self-describing entities

Every entity has a method that describes itself. For LLMEntity, these compose the system prompt automatically:

```typescript
@Describe()
describe() {
  return `Research assistant specializing in: ${this.expertise.join(', ')}.
  ${this.entries.length} findings stored.`;
}
```

The LLM sees its own description plus all visible refs' descriptions. Dynamic, always current.

### `@Tool()` -- Methods the LLM can call

```typescript
@Tool({ description: 'Search stored entries by keyword' })
async search(input: { query: string }): Promise<string[]> {
  return this.entries.filter(e => e.includes(input.query));
}
```

The framework extracts the TypeScript types at build time and generates JSON schemas. The LLM sees typed tools, not strings.

### `@Ref()` -- Cross-entity tool visibility

```typescript
@Ref() private memory!: Memory;   // LLM sees memory.store(), memory.search()
@Ref() private slack!: Slack;     // LLM sees slack.sendMessage(), etc.
```

Point at a sibling and the LLM automatically sees all its `@Tool` methods. No registration.

### `@State()` -- Persistent properties

```typescript
@State({ description: 'Conversation history' })
private entries: string[] = [];
```

Saved to the database after every tool call. Survives restarts. Prisma or custom adapter.

### `@Hook()` -- Autonomous behavior

```typescript
@Hook(Tick.Runner({ intervalMs: 30000 }))
async onTick(input: Tick.Input) { /* runs every 30s */ }

@Hook(HttpRequest.Runner({ port: 3000, path: '/chat' }))
async onRequest(input: HttpRequest.Input) { /* HTTP endpoint */ }

@Hook(Cron.Runner({ expression: '0 9 * * *' }))
async onMorning(input: Cron.Input) { /* daily at 9am */ }
```

---

## Templates

`interactkit init` offers four starting points:

| Template | What you get |
|----------|-------------|
| **Agent** | Root + LLM brain + memory + HTTP API |
| **Team** | Coordinator + researcher + writer + shared memory |
| **Simulation** | World + 3 personas with brains + tick loop |
| **Blank** | Just a root entity |

---

## Dev Mode

`pnpm dev` gives you:

- Hot reload on `.ts` changes
- Restart on `.env` changes
- Colored event logs (tool calls, responses, errors)
- Auto-codegen on every rebuild

---

## Docs

| Guide | What you'll learn |
|-------|-------------------|
| [Why InteractKit](https://github.com/InteractKit/interactkit/blob/main/docs/why.md) | Philosophy and what it unlocks |
| [Getting Started](https://github.com/InteractKit/interactkit/blob/main/docs/getting-started.md) | Build your first agent |
| [Entities](https://github.com/InteractKit/interactkit/blob/main/docs/entities.md) | State, tools, children, refs, streams |
| [LLM Entities](https://github.com/InteractKit/interactkit/blob/main/docs/llm.md) | Giving entities a brain |
| [Hooks](https://github.com/InteractKit/interactkit/blob/main/docs/hooks.md) | Timers, cron, HTTP, WebSocket |
| [Infrastructure](https://github.com/InteractKit/interactkit/blob/main/docs/infrastructure.md) | Database, pub/sub, logging |
| [Testing](https://github.com/InteractKit/interactkit/blob/main/docs/testing.md) | bootTest, mockLLM, mockEntity |
| [Extensions](https://github.com/InteractKit/interactkit/blob/main/docs/extensions.md) | Custom hooks and integrations |

## Packages

| Package | Description |
|---------|-------------|
| [`@interactkit/sdk`](https://github.com/InteractKit/interactkit/tree/main/sdk) | Core: decorators, runtime, LLM, MCP |
| [`@interactkit/cli`](https://github.com/InteractKit/interactkit/tree/main/cli) | CLI: init, add, build, dev |
| [`@interactkit/http`](https://github.com/InteractKit/interactkit/tree/main/extensions/http) | HTTP server hook |
| [`@interactkit/websocket`](https://github.com/InteractKit/interactkit/tree/main/extensions/websocket) | WebSocket hook |
