# Extensions

Extensions add custom hook types and entities to InteractKit. They're just npm packages.

## Using an Extension

Install it and use like any entity:

```typescript
import { Entity, BaseEntity, Component } from '@interactkit/sdk';
import { TwilioPhone } from '@interactkit/twilio';

@Entity()
class Agent extends BaseEntity {
  @Component() private phone!: TwilioPhone;
  @Component() private brain!: Brain;
}
```

The build discovers extensions automatically.

## Building an Extension

An extension exports a namespace with `Input` + `Runner`, and entity classes that use them.

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
    return { __hookHandler: true, runnerClass: RunnerImpl, config };
  }
}
```

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

## Package Structure

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
import { Entity, BaseEntity, Component } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private slack!: Slack;
  @Component() private github!: GitHub;
}
```

All refs and components are visible to the LLM by default -- no extra wiring needed. The LLM gets all the MCP server's tools automatically. See [LLM Entities](llm.md#mcp-as-entities) for full details.

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
- [Codegen](./codegen.md): what the build generates from your entities
