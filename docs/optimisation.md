# Optimisation

InteractKit defaults to simplicity. Everything runs in one process with zero config. When you need performance or scale, you opt in per entity. This guide covers what to tune and when.

## Pub/Sub: The Single Biggest Lever

Every cross-entity call goes through pub/sub. The adapter you choose determines latency, scalability, and deployment topology.

`PubSubAdapter` has two subclass families: `LocalPubSubAdapter` (no serialization, pass by reference) and `RemotePubSubAdapter` (JSON serialization + automatic proxy for non-serializable values).

```
LocalPubSubAdapter                RemotePubSubAdapter
  InProcessBusAdapter (default)     RedisPubSubAdapter
  ~0ms latency                      ~1-5ms latency
  Single process only               Horizontal scaling
  No network overhead               Cross-process, cross-machine
  No serialization                  JSON serialization + proxy
  No persistence                    Durable queues
```

Remote adapters add proxy overhead: non-serializable values (functions, class instances) are automatically proxied across processes via `ProxyReceiver`. This is transparent but adds latency per property access or method call on proxied values.

### When to Use What

| Scenario | Adapter | Why |
|----------|---------|-----|
| Dev / prototyping | InProcess | Zero setup, instant |
| LLM tool loop (many rapid calls) | InProcess | Latency matters in tight loops |
| Voice / real-time | InProcess | Sub-ms response required |
| Multiple replicas | Redis | Competing consumer distributes work |
| Separate processes | Redis | Cross-process communication |
| State sync across instances | Redis | Broadcast state changes |

### Mix and Match

Set Redis on the root, override InProcess on hot paths:

```typescript
import { Entity, BaseEntity, Component, RedisPubSubAdapter, InProcessBusAdapter } from '@interactkit/sdk';

@Entity({ pubsub: RedisPubSubAdapter })
class Agent extends BaseEntity {
  @Component() private brain!: Brain;       // Redis — can scale separately
  @Component() private memory!: Memory;     // Redis — can scale separately
  @Component() private cache!: Cache;       // InProcess — fast, co-located
}

@Entity({ pubsub: InProcessBusAdapter })
class Cache extends BaseEntity { /* sub-ms access */ }
```

The cache stays in the same process as the agent. Brain and memory can run anywhere.

## State: Reactive Proxy Costs

Every `@State` property uses a JavaScript proxy that tracks mutations. This is nearly free for simple assignments but has costs to be aware of:

### Debounced Flush

State changes are batched in a 10ms debounce window. Multiple mutations in the same tick = one DB write:

```typescript
// These three mutations produce ONE flush, not three:
this.count = 1;
this.count = 2;
this.count = 3;  // only this value gets written
```

### Array Proxies

Array mutations (`push`, `pop`, `splice`, `sort`, `reverse`) are intercepted. Each one marks dirty and resets the debounce timer. In tight loops, batch your mutations:

```typescript
// Slow: 1000 push calls = 1000 dirty marks (still one flush, but proxy overhead)
for (let i = 0; i < 1000; i++) this.items.push(i);

// Faster: one assignment = one dirty mark
this.items = [...this.items, ...newItems];
```

### State Sync Broadcast

When state changes, the new state is broadcast to all replicas via `publish`. This is a full snapshot, not a diff. Keep state objects small for entities with many replicas:

```typescript
// Good: small, focused state
@State({ description: 'count' }) private count = 0;

// Avoid: large blob that broadcasts on every change
@State({ description: 'cache' }) private cache: Record<string, LargeObject> = {};
```

## Streams: In-Process vs Redis

Streams use the child entity's pub/sub adapter:

| Child adapter | Stream transport | Latency | Scalable |
|---------------|-----------------|---------|----------|
| InProcess | Direct function call | ~0ms | No |
| Redis | `publish`/`subscribe` | ~1-5ms | Yes |

For high-frequency streams (sensors, ticks), keep the child InProcess if the parent needs every event with minimal delay. For event-driven streams where occasional latency is fine, Redis lets you scale the emitter.

## Hooks: inProcess vs Remote

Hooks declared with `inProcess: true` (like `Init`) run directly — zero overhead. Remote hooks (`Tick`, `Cron`, `HttpRequest`) go through the queue:

```
inProcess hook:  runner → method call (direct)
remote hook:     runner → enqueue → consume → method call (via Redis)
```

For high-frequency ticks, consider whether you actually need the hook server pattern. If the entity always runs in one process, you can create a custom tick runner with `inProcess: true`:

```typescript
import type { HookRunner, HookHandler } from '@interactkit/sdk';

export namespace FastTick {
  export interface Input { tick: number; }

  class RunnerImpl implements HookRunner<Input> {
    private timer?: ReturnType<typeof setInterval>;
    private count = 0;
    async start(emit: (data: Input) => void, config: Record<string, unknown>) {
      this.timer = setInterval(() => emit({ tick: ++this.count }), config.intervalMs as number);
    }
    async stop() { if (this.timer) clearInterval(this.timer); }
  }

  export function Runner(config: { intervalMs: number }): HookHandler<Input> {
    return { __hookHandler: true, runnerClass: RunnerImpl, config, inProcess: true };
  }
}
```

## Event Bus: Request/Response Overhead

Every tool call across entities is a request/response through the event bus:

```
caller → enqueue request → consumer processes → publish reply → caller receives
```

For InProcess, this is a synchronous function call chain. For Redis, it's 2 network round trips (enqueue + publish reply). Minimize cross-entity calls in hot paths:

```typescript
// Slow: 3 cross-entity calls
const a = await this.memory.get({ key: 'x' });
const b = await this.memory.get({ key: 'y' });
const c = await this.memory.get({ key: 'z' });

// Faster: 1 cross-entity call with batch
const all = await this.memory.getMany({ keys: ['x', 'y', 'z'] });
```

## Entity Count

Each entity registers with the dispatcher and listens on the event bus. For InProcess, this is cheap (Map lookups). For Redis, each entity creates subscriptions. Keep entity count reasonable — tens to low hundreds, not thousands.

If you need thousands of instances of the same type, use one entity with internal state management rather than thousands of entities.

## Deployment Topology

| Setup | Best for | Entities |
|-------|----------|----------|
| Single process (`_entry.js`) | Dev, small projects | All in one |
| Multi-unit (`_unit-*.js`) | Production, scaling | Split by adapter |
| Multi-replica | High throughput | Multiple instances of Redis entities |

### Scaling Decision Tree

```
Is this entity called frequently?
  ├── Yes → Does it need sub-ms latency?
  │         ├── Yes → InProcess (co-locate with caller)
  │         └── No  → Redis (separate process, scale replicas)
  └── No  → Redis (separate for isolation, don't bother scaling)
```

---

## Related

- [Infrastructure](./infrastructure.md): adapter setup and config
- [Deployment](./deployment.md): Docker, entrypoints, scaling
