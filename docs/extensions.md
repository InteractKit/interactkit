# Extensions

Extensions add custom hook types and entities to InteractKit. They're just npm packages.

## Using an Extension

Install it and use like any entity:

```typescript
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
    async start(emit: (data: Input) => void, config: Record<string, unknown>) {
      // Set up Twilio webhook, call emit() when SMS arrives
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

Any [MCP](https://modelcontextprotocol.io) server becomes an entity with `@MCP`. At boot, InteractKit connects, discovers tools, and registers them as `@Tool` methods:

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

Use it like any other entity:

```typescript
@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private slack!: SlackMCP;
  @Component() private github!: GitHubMCP;
}
```

Mark it `@LLMVisible()` in your LLM entity and the LLM gets all the MCP server's tools. No extra wiring. See [LLM Entities](llm.md#mcp-as-entities) for full options.

---

## What's Next?

- [Infrastructure](./infrastructure.md): database, pub/sub, and logging adapters
- [Codegen](./codegen.md): what the build generates from your entities
