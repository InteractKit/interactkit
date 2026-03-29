# Extensions

Extensions add custom hook types, adapters, and entities to InteractKit. They're just npm packages.

## Using an Extension

Install the package and import what you need:

```bash
pnpm add @interactkit/cron
```

```typescript
import { Entity, BaseEntity, Hook, type Remote } from '@interactkit/sdk';
import { Cron } from '@interactkit/cron';

@Entity()
class Worker extends BaseEntity {
  @Hook(Cron.Runner({ expression: '0 9 * * 1' }))
  async onSchedule(input: Remote<Cron.Input>) {
    // runs every Monday at 9am
  }
}
```

For adapter extensions, install and use in `interactkit.config.ts`:

```bash
pnpm add @interactkit/redis @interactkit/prisma
```

```typescript
// interactkit.config.ts
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { RedisPubSubAdapter } from '@interactkit/redis';
import type { InteractKitConfig } from '@interactkit/sdk';

export default {
  database: new PrismaDatabaseAdapter({ url: 'file:./app.db' }),
  pubsub: new RedisPubSubAdapter({ host: 'localhost', port: 6379 }),
} satisfies InteractKitConfig;
```

The build discovers extensions automatically.

## Extension Packages

| Package | What it provides |
|---------|-----------------|
| `@interactkit/redis` | `RedisPubSubAdapter({ host?, port?, url? })` -- horizontal scaling via Redis |
| `@interactkit/prisma` | `PrismaDatabaseAdapter({ url })` -- Prisma-backed state persistence |
| `@interactkit/cron` | `Cron` hook -- cron scheduling via node-cron |
| `@interactkit/http` | `HttpRequest` hook -- HTTP server |
| `@interactkit/websocket` | `WsMessage`, `WsConnection` hooks -- WebSocket server |

## Building an Extension

An extension exports a namespace with `Input` + `Runner`, and optionally entity classes that use them.

### 1. Hook Namespace

Group the input type and runner factory under a namespace:

```typescript
import type { HookRunner, HookHandler } from '@interactkit/sdk';

export namespace Sms {
  export interface Input {
    from: string;
    body: string;
  }

  class RunnerImpl implements HookRunner<Input> {
    async init(config: Record<string, unknown>) {
      // Set up shared resources using config from interactkit.config.ts
    }
    register(emit: (data: Input) => void, config: Record<string, unknown>) {
      // Register per-entity emit callback, call emit() when SMS arrives
    }
    async stop() { /* cleanup */ }
  }

  export function Runner(config: { phoneNumber: string }): HookHandler<Input> {
    return {
      __hookHandler: true,
      runnerClass: RunnerImpl,
      config,
      initConfig: { /* defaults, overridable via interactkit.config.ts hooks */ },
    };
  }
}
```

The `HookRunner` lifecycle:

- `init(config)` -- set up shared resources. Config = defaults from `initConfig` merged with overrides from `interactkit.config.ts` `hooks` field.
- `register(emit, config)` -- add an emit callback per entity. Config = per-entity run config from `@Hook(Runner(config))`.
- `stop()` -- tear down resources.

### 2. Entity Classes

Standard entities that use the custom hook:

```typescript
import { Entity, BaseEntity, State, Configurable, Hook, Tool } from '@interactkit/sdk';

@Entity()
export class TwilioPhone extends BaseEntity {
  @State({ description: 'Phone number' })
  @Configurable({ label: 'Phone Number' })
  private phoneNumber!: string;

  @Hook(Sms.Runner({ phoneNumber: '+1234567890' }))
  async onSms(input: Sms.Input) {
    // Handle incoming SMS
  }

  @Tool({ description: 'Send an SMS' })
  async sendSms(input: { to: string; body: string }) { /* ... */ }
}
```

### Package Structure

```
@interactkit/twilio/
  src/
    sms.ts        # Sms namespace (Input + Runner)
    entity.ts     # Entity classes
    index.ts      # Barrel export
  package.json    # @interactkit/sdk as peer dependency
```

The runner is explicit in `@Hook(Sms.Runner(config))`. No auto-discovery needed.

## MCP Servers as Entities

Any [MCP](https://modelcontextprotocol.io) server becomes an entity via the CLI. InteractKit generates the entity file, connects at boot, discovers tools, and registers them as `@Tool` methods:

```bash
interactkit add Slack --mcp-stdio "npx -y @slack/mcp-server"
interactkit add GitHub --mcp-stdio "npx -y @github/mcp-server"
```

This generates entity files with the MCP transport pre-configured. Use them like any other entity:

```typescript
import { Entity, BaseEntity, Component, type Remote } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Remote<Brain>;
  @Component() private slack!: Remote<Slack>;
  @Component() private github!: Remote<GitHub>;
}
```

All refs and components are visible to the LLM by default -- no extra wiring needed. The LLM gets all the MCP server's tools automatically.

### Authentication and Environment

Pass headers or environment variables to the MCP server process:

```bash
# Pass auth headers (for HTTP/SSE transports)
interactkit add Slack --mcp-stdio "npx -y @slack/mcp-server" \
  --mcp-header "Authorization: Bearer $SLACK_TOKEN"

# Pass environment variables (for stdio transports)
interactkit add GitHub --mcp-stdio "npx -y @github/mcp-server" \
  --mcp-env "GITHUB_TOKEN=$GITHUB_TOKEN"
```

Multiple `--mcp-header` and `--mcp-env` flags can be passed to set several values at once.

---

## What's Next?

- [Infrastructure](./infrastructure.md): database, pub/sub, and observer adapters
- [Hooks](./hooks.md): built-in and extension hooks in detail
