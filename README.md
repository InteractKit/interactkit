# InteractKit

**TypeScript framework for building LLM agents that actually scale.**

```bash
npm i -g @interactkit/cli
interactkit init my-agent
cd my-agent && pnpm install && pnpm dev
```

---

## What You Can Build

- **Agents with memory** -- entities that remember past conversations and persist state across restarts
- **Multi-agent teams** -- a router brain triages requests to specialist agents, each with their own LLM and tools
- **MCP integrations** -- connect any MCP server (Slack, GitHub, Jira, Stripe) and get a typed entity with one CLI command
- **Autonomous systems** -- agents that run on timers, cron schedules, or react to HTTP/WebSocket events with zero orchestration code
- **Simulations** -- multiple personas with brains and shared world state, ticking on an interval

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

The class tree is the architecture. No config files, no routing tables, no glue code.

---

## Quick Start

```bash
npx @interactkit/cli init my-agent    # pick template + database
cd my-agent
pnpm install
pnpm dev                              # builds, runs, watches, colored logs
```

Add entities:

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
