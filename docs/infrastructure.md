# Infrastructure

Infrastructure config (database, pubsub, logger) is set on the `@Entity` decorator. Sub-entities inherit from their parent and can override.

## Setting infra on the root entity

```typescript
import {
  Entity, BaseEntity,
  PrismaDatabaseAdapter, RedisPubSubAdapter, ConsoleLogAdapter,
} from '@interactkit/sdk';

@Entity({
  type: 'person',
  database: PrismaDatabaseAdapter,
  pubsub: RedisPubSubAdapter,
  logger: ConsoleLogAdapter,
})
class Person extends BaseEntity {
  brain: Brain;   // inherits all three
  phone: Phone;   // inherits all three
}
```

## Per-entity overrides

Any sub-entity can override one or more adapters:

```typescript
import { InProcessBusAdapter } from '@interactkit/sdk';

@Entity({
  type: 'phone',
  pubsub: InProcessBusAdapter,  // fast path for voice — overrides parent's Redis
})
class Phone extends BaseEntity {
  // Uses parent's database (inherited)
  // Uses InProcessBusAdapter (overridden)
  // Uses parent's logger (inherited)
}
```

## Adapter interfaces

### PubSubAdapter

```typescript
interface PubSubAdapter {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
}
```

**Built-in implementations:**

| Adapter | Latency | Scaling | Use case |
|---------|---------|---------|----------|
| `InProcessBusAdapter` | ~0ms | Single process | Default, fast paths |
| `RedisPubSubAdapter` | ~1-5ms | Horizontal | Multi-instance deployments |

### DatabaseAdapter

```typescript
interface DatabaseAdapter {
  get(entityId: string): Promise<Record<string, unknown> | null>;
  set(entityId: string, state: Record<string, unknown>): Promise<void>;
  delete(entityId: string): Promise<void>;
}
```

**Built-in:** `PrismaDatabaseAdapter` — requires a Prisma client with an `EntityState` model:

```prisma
model EntityState {
  id    String @id
  state Json
}
```

### LogAdapter

```typescript
interface LogAdapter {
  event(envelope: EventEnvelope): void;
  error(envelope: EventEnvelope, error: Error): void;
}
```

**Built-in:** `ConsoleLogAdapter` — logs all events and errors to stdout/stderr.

The logger automatically sees all serialized events flowing through the event bus. No manual instrumentation in entity code.

## Resolution order

The runtime resolves infra per entity by checking its own `@Entity` params first, then walking up the parent chain:

```
Phone has pubsub override? → use it
Phone has database override? → no → check Person
Person has database? → yes → use it
```

## Custom adapters

Implement the interface and pass the constructor:

```typescript
class MyCustomPubSub implements PubSubAdapter {
  async publish(channel: string, message: string) { /* ... */ }
  async subscribe(channel: string, handler: (message: string) => void) { /* ... */ }
  async unsubscribe(channel: string) { /* ... */ }
}

@Entity({ type: 'root', pubsub: MyCustomPubSub })
class Root extends BaseEntity { /* ... */ }
```

## Configuration

Built-in adapters auto-configure from `node-config` or environment variables. No manual wiring.

**`config/default.json`:**
```json
{
  "interactkit": {
    "redis": {
      "host": "127.0.0.1",
      "port": 6379,
      "password": "optional",
      "db": 0
    },
    "database": {
      "url": "file:./interactkit.db"
    }
  }
}
```

**Or via environment variables:**

| Adapter | Env vars |
|---------|----------|
| `RedisPubSubAdapter` | `REDIS_URL` or `REDIS_HOST` + `REDIS_PORT` (+ optional `REDIS_PASSWORD`, `REDIS_DB`) |
| `PrismaDatabaseAdapter` | `DATABASE_URL` |

**Resolution order:** node-config `interactkit.*` → env vars → throws error.

No defaults — if you use an adapter without config, the app throws at startup with a clear error message.

See also: [Deployment Planning](./deployment.md) for how adapters affect scaling.
