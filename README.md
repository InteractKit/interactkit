# InteractKit

**Build worlds of AI agents in TypeScript.**

Define agents as classes, give them brains, memory, and tools with decorators, and let them talk to each other. No orchestration code, no glue, no config files -- just a tree of entities that runs.

```bash
npm i -g @interactkit/cli
interactkit init my-world
cd my-world && pnpm install && pnpm dev
```

---

## What You Can Build

- **Agent teams** -- a router brain triages requests to specialists, each with their own LLM and tools
- **Agents with memory** -- entities that remember conversations and persist state across restarts
- **MCP-powered worlds** -- connect Slack, GitHub, Jira, Stripe as typed entities with one CLI command
- **Autonomous systems** -- agents that react to HTTP requests, cron schedules, or timers
- **Simulations** -- personas with brains and shared world state, ticking on an interval

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

The class tree is the architecture.

---

## Quick Start

```bash
interactkit init my-world
cd my-world
pnpm install
pnpm dev
```

Add entities to your world:

```bash
interactkit add Memory --attach Agent                                  # plain entity
interactkit add Brain --llm --attach Agent                             # LLM entity
interactkit add Slack --mcp-stdio "npx -y @slack/mcp" --attach Agent   # from MCP server
```

---

## Docs

Full documentation at **[docs.interactkit.dev](https://docs.interactkit.dev)**

## Packages

| Package | Description |
|---------|-------------|
| [`@interactkit/sdk`](https://github.com/InteractKit/interactkit/tree/main/sdk) | Core: decorators, runtime, LLM, MCP |
| [`@interactkit/cli`](https://github.com/InteractKit/interactkit/tree/main/cli) | CLI: init, add, build, dev |
| [`@interactkit/http`](https://github.com/InteractKit/interactkit/tree/main/extensions/http) | HTTP server hook |
| [`@interactkit/websocket`](https://github.com/InteractKit/interactkit/tree/main/extensions/websocket) | WebSocket hook |
