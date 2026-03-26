# Infrastructure

InteractKit uses pluggable adapters for database, pub/sub, and logging. Set them on your root entity. Children inherit them.

## Setup

```typescript
import { Entity, BaseEntity, Component, PrismaDatabaseAdapter, RedisPubSubAdapter, ConsoleLogAdapter } from '@interactkit/sdk';

@Entity({
  database: PrismaDatabaseAdapter,
  pubsub: RedisPubSubAdapter,
  logger: ConsoleLogAdapter,
})
class Agent extends BaseEntity {
  @Component() private brain!: Brain;   // inherits all three
  @Component() private memory!: Memory; // inherits all three
}
```

Any child can override an adapter:

```typescript
import { Entity, BaseEntity, InProcessBusAdapter } from '@interactkit/sdk';

@Entity({
  pubsub: InProcessBusAdapter, // override just pub/sub
})
class Memory extends BaseEntity { /* ... */ }
```

## Built-in Adapters

### Pub/Sub

| Adapter | When to use |
|---------|------------|
| `InProcessBusAdapter` | Default. Single process, no setup needed. |
| `RedisPubSubAdapter` | When you need to scale across machines. |

### Database

`PrismaDatabaseAdapter` needs an `EntityState` model in your Prisma schema:

```prisma
model EntityState {
  id    String @id
  state Json
}
```

### Logging

`ConsoleLogAdapter` logs to stdout/stderr.

## Custom Adapters

Implement the interface and pass it:

```typescript
import { Entity, BaseEntity } from '@interactkit/sdk';
import type { PubSubAdapter } from '@interactkit/sdk';

class MyPubSub implements PubSubAdapter {
  async publish(channel: string, message: string) { /* ... */ }
  async subscribe(channel: string, handler: (msg: string) => void) { /* ... */ }
  async unsubscribe(channel: string) { /* ... */ }
}

@Entity({ pubsub: MyPubSub })
class Agent extends BaseEntity { /* ... */ }
```

## Config

Adapters read from `config/default.json`:

```json
{
  "interactkit": {
    "redis": { "host": "127.0.0.1", "port": 6379 },
    "database": { "url": "file:./interactkit.db" }
  }
}
```

Or environment variables:

| Adapter | Env vars |
|---------|----------|
| `RedisPubSubAdapter` | `REDIS_URL` or `REDIS_HOST` + `REDIS_PORT` |
| `PrismaDatabaseAdapter` | `DATABASE_URL` |

Missing config throws a clear error at startup.

---

## What's Next?

- [Codegen](./codegen.md): what the build generates
- [Deployment](./deployment.md): scaling and deploying your agents
