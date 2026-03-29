# Optimisation

InteractKit defaults to simplicity. Everything runs in one process with zero config. When you need performance or scale, you opt in per entity. This guide covers what to tune and when.

## Pub/Sub: The Single Biggest Lever

Every cross-entity call goes through pub/sub. The adapter determines latency, scalability, and deployment topology.

`PubSubAdapter` has two subclass families: `LocalPubSubAdapter` (no serialization, pass by reference) and `RemotePubSubAdapter` (JSON serialization + automatic proxy for non-serializable values).

```
LocalPubSubAdapter                RemotePubSubAdapter
  InProcessBusAdapter (default)     RedisPubSubAdapter (@interactkit/redis)
  ~0ms latency                      ~1-5ms latency
  Single process only               Horizontal scaling
  No network overhead               Cross-process, cross-machine
  No serialization                  JSON serialization + proxy
  No persistence                    Durable queues
```

Remote adapters add proxy overhead: non-serializable values (functions, class instances) are automatically proxied across processes via `ProxyReceiver`. This is transparent but adds latency per property access or method call on proxied values.

### When to Use What

| Scenario | Approach | Why |
|----------|---------|-----|
| Dev / prototyping | Default (InProcess) | Zero setup, instant |
| LLM tool loop (many rapid calls) | Keep co-located | Latency matters in tight loops |
| Voice / real-time | Keep co-located | Sub-ms response required |
| Multiple replicas | `detached: true` | Competing consumer distributes work |
| Separate processes | `detached: true` | Cross-process communication |
| State sync across instances | `detached: true` | Broadcast state changes via remote pubsub |

### Mix and Match

Mark hot-path entities as co-located (default), detach the rest:

```typescript
import { Entity, BaseEntity, Component, type Remote } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() private cache!: Remote<Cache>;       // co-located -- fast
  @Component() private brain!: Remote<Brain>;       // co-located -- fast
  @Component() private memory!: Remote<Memory>;     // detached -- can scale separately
}

@Entity()
class Cache extends BaseEntity { /* sub-ms access */ }

@Entity({ detached: true })
class Memory extends BaseEntity { /* scales independently */ }
```

The cache stays in the same process as the agent. Memory can run anywhere.

## State: Reactive Proxy Costs

Every `@State` property uses a JavaScript proxy that tracks mutations. This is nearly free for simple assignments but has costs to be aware of:

### Debounced Flush

State changes are batched in a debounce window (configurable via `stateFlushMs` in `interactkit.config.ts`, default 10ms). Multiple mutations in the same tick = one DB write:

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

## Streams: In-Process vs Remote

Streams use the child entity's communication model:

| Child config | Stream transport | Latency | Scalable |
|--------------|-----------------|---------|----------|
| Default | Direct function call | ~0ms | No |
| `detached: true` | Remote pubsub | ~1-5ms | Yes |

For high-frequency streams (sensors, ticks), keep the child co-located if the parent needs every event with minimal delay. For event-driven streams where occasional latency is fine, detaching lets you scale the emitter.

## Hooks: inProcess vs Remote

Hooks declared with `inProcess: true` (like `Init`) run directly -- zero overhead. Remote hooks (`Tick`, `Cron`, `HttpRequest`) go through the queue:

```
inProcess hook:  runner -> method call (direct)
remote hook:     runner -> enqueue -> consume -> method call (via pubsub)
```

For high-frequency ticks, consider whether you actually need the hook server pattern. If the entity always runs in one process, you can create a custom tick runner with `inProcess: true`:

```typescript
import type { HookRunner, HookHandler } from '@interactkit/sdk';

export namespace FastTick {
  export interface Input { tick: number; }

  class RunnerImpl implements HookRunner<Input> {
    private timer?: ReturnType<typeof setInterval>;
    private count = 0;
    private intervalMs = 60_000;
    async init(config: Record<string, unknown>) {
      this.intervalMs = (config.intervalMs as number) ?? 60_000;
    }
    register(emit: (data: Input) => void, _config: Record<string, unknown>) {
      this.timer = setInterval(() => emit({ tick: ++this.count }), this.intervalMs);
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
caller -> enqueue request -> consumer processes -> publish reply -> caller receives
```

For InProcess, this is a synchronous function call chain. For remote pubsub, it's 2 network round trips (enqueue + publish reply). Minimize cross-entity calls in hot paths:

```typescript
// Slow: 3 cross-entity calls
const a = await this.memory.get({ key: 'x' });
const b = await this.memory.get({ key: 'y' });
const c = await this.memory.get({ key: 'z' });

// Faster: 1 cross-entity call with batch
const all = await this.memory.getMany({ keys: ['x', 'y', 'z'] });
```

## Entity Count

Each entity registers with the dispatcher and listens on the event bus. For InProcess, this is cheap (Map lookups). For remote pubsub, each entity creates subscriptions. Keep entity count reasonable -- tens to low hundreds, not thousands.

If you need thousands of instances of the same type, use one entity with internal state management rather than thousands of entities.

## Deployment Topology

| Setup | Best for | Entities |
|-------|----------|----------|
| Single process (`_entry.js`) | Dev, small projects | All in one |
| Multi-unit (`_unit-*.js`) | Production, scaling | Split by detached flag |
| Multi-replica | High throughput | Multiple instances of detached entities |

### Scaling Decision Tree

```
Is this entity called frequently?
  +-- Yes -> Does it need sub-ms latency?
  |          +-- Yes -> Keep co-located (default)
  |          +-- No  -> detached: true (separate process, scale replicas)
  +-- No  -> detached: true (separate for isolation, don't bother scaling)
```

---

## Related

- [Infrastructure](./infrastructure.md): adapter setup and config
- [Deployment](./deployment.md): Docker, entrypoints, scaling
