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

| Adapter | Latency | Scaling | Use case |
|---------|---------|---------|----------|
| `InProcessBusAdapter` | ~0ms | Single process | Default. Dev mode, real-time voice, hot loops |
| `RedisPubSubAdapter` | ~1-5ms | Horizontal | Cross-process entity communication, replicas |

The pub/sub adapter has two delivery modes:

| Method | Behavior | Used for |
|--------|----------|----------|
| `publish` / `subscribe` | Broadcast -- all subscribers get every message | Reply channels, state sync |
| `enqueue` / `consume` | Queue -- one consumer picks each message | Tool calls, hooks, work distribution |

Entities with `RedisPubSubAdapter` get competing consumer semantics. Run 3 replicas and each request goes to exactly one:

```typescript
import { Entity, BaseEntity, Tool, RedisPubSubAdapter } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
class Worker extends BaseEntity {
  @Tool({ description: 'Process task' })
  async process(input: { task: string }) {
    return { result: input.task.toUpperCase(), pid: process.pid };
  }
}
// Run 3 instances → tasks distribute across all 3
```

### Database

`PrismaDatabaseAdapter` stores entity state as JSON. Needs an `EntityState` model:

```prisma
datasource db {
  provider = "sqlite"   // or "postgresql"
  url      = env("DATABASE_URL")
}

model EntityState {
  id    String @id
  state String
}
```

State persistence is automatic:
- `@State` properties save to DB via reactive proxy (debounced, 10ms)
- State restores on entity restart
- State changes broadcast to other replicas via pub/sub

### Logging

| Adapter | Output |
|---------|--------|
| `ConsoleLogAdapter` | Plain stdout/stderr |
| `DevLogAdapter` | Colored, formatted (used in `pnpm dev`) |

Loggers see all events flowing through the event bus -- tool calls, hook events, errors.

## Custom Adapters

### Pub/Sub

```typescript
import type { PubSubAdapter } from '@interactkit/sdk';

class MyPubSub implements PubSubAdapter {
  // Broadcast -- all subscribers receive
  async publish(channel: string, message: string) { /* ... */ }
  async subscribe(channel: string, handler: (msg: string) => void) { /* ... */ }
  async unsubscribe(channel: string) { /* ... */ }

  // Queue -- one consumer picks each message
  async enqueue(channel: string, message: string) { /* ... */ }
  async consume(channel: string, handler: (msg: string) => void) { /* ... */ }
  async stopConsuming(channel: string) { /* ... */ }
}
```

### Database

```typescript
import type { DatabaseAdapter } from '@interactkit/sdk';

class MyDatabase implements DatabaseAdapter {
  async get(entityId: string): Promise<Record<string, unknown> | null> { /* ... */ }
  async set(entityId: string, state: Record<string, unknown>): Promise<void> { /* ... */ }
  async delete(entityId: string): Promise<void> { /* ... */ }
}
```

### Logger

```typescript
import type { LogAdapter } from '@interactkit/sdk';
import type { EventEnvelope } from '@interactkit/sdk';

class MyLogger implements LogAdapter {
  event(envelope: EventEnvelope): void { /* every event */ }
  error(envelope: EventEnvelope, error: Error): void { /* failed events */ }
}
```

## What the Adapters Control

| Feature | Adapter | How it works |
|---------|---------|-------------|
| Tool calls between entities | Pub/Sub | `enqueue`/`consume` on entity channels |
| Hook events from hook server | Pub/Sub | `enqueue`/`consume` on hook channels |
| State sync between replicas | Pub/Sub | `publish`/`subscribe` on state channels |
| Stream data (child → parent) | Pub/Sub | `publish`/`subscribe` on stream channels (Redis), or direct in-memory (InProcess) |
| State persistence | Database | Auto-save on mutation, restore on boot |
| Event logging | Logger | All events + errors flowing through the bus |

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
