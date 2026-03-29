# Deployment

`interactkit build` generates everything you need to deploy: entrypoints, Docker files, and a deployment plan.

## What Gets Generated

```
.interactkit/generated/
├── _entry.js                    # Single-process entrypoint (all entities)
├── _unit-agent.js               # Agent unit entrypoint
├── _unit-memory.js              # Memory unit entrypoint
├── _hooks.js                    # Hook server entrypoint
├── _all.js                      # All units + hooks in one process
├── deployment.json              # Deployment plan
├── Dockerfile                   # Multi-stage Docker build
├── docker-compose.yml           # Distributed: one service per unit
└── docker-compose.single.yml   # Single container: everything together
```

## Single Process

The simplest deployment. Everything runs in one container:

```bash
docker compose -f .interactkit/generated/docker-compose.single.yml up
```

Or without Docker:

```bash
interactkit build --root=src/agent:Agent
node .interactkit/build/src/_entry.js
```

## Distributed

Each deployment unit runs as a separate service, connected via Redis:

```bash
docker compose -f .interactkit/generated/docker-compose.yml up
```

This starts:
- One service per deployment unit
- A Redis instance for cross-unit communication
- A hook server for remote hooks (Tick, Cron, HTTP, etc.)
- Scalable units get 2 replicas by default

### How Units Are Determined

The build analyzes your entity tree and groups entities by their pub/sub adapter:

| Adapter | Scaling | Rule |
|---------|---------|------|
| `InProcessBusAdapter` (default) | Must share a process | Grouped with parent |
| `RedisPubSubAdapter` | Can scale independently | Gets its own unit |
| `EntityStream` on InProcess | Must share a process | Grouped with parent |
| `EntityStream` on Redis | Can scale independently | Streams publish via Redis automatically |

```typescript
import { Entity, BaseEntity, Component } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() brain!: Brain;      // InProcess → same unit as Agent
  @Component() memory!: Memory;    // detached → separate unit, scalable
}

@Entity({ detached: true })
class Memory extends BaseEntity { /* ... */ }
```

Generated `deployment.json`:

```json
{
  "units": [
    { "name": "unit-agent", "entities": ["agent", "brain"], "scalable": false },
    { "name": "unit-memory", "entities": ["memory"], "scalable": true }
  ],
  "connections": [
    { "from": "unit-agent", "to": "unit-memory", "adapter": "RedisPubSubAdapter" }
  ]
}
```

### Scaling Replicas

Scalable units can run multiple replicas. Tasks are distributed via competing consumers -- only one replica picks up each request:

```yaml
# In docker-compose.yml
memory:
  deploy:
    replicas: 5   # 5 Memory instances sharing the workload
```

State syncs automatically between replicas via Redis broadcast.

### Hooks

Hooks that run remotely (Tick, Cron, HTTP) are separated into a hook server. The generated `_hooks.ts` creates actual hook runners that start and publish events to pubsub:

- `_hooks.ts` generates a hook server that instantiates runners and starts them
- Each runner publishes events to the entity's pubsub queue
- Entity servers consume hook events from the queue via their pubsub adapter
- `Init` hooks run in-process (no hook server needed)

## Entrypoints

| File | Use case |
|------|----------|
| `_entry.js` | Single process — boots full tree via `boot()` |
| `_unit-{name}.js` | Distributed — boots one unit via `Runtime` |
| `_hooks.js` | Hook server — runs Tick/Cron/HTTP runners |
| `_all.js` | Dev convenience — imports all units + hooks |

## Running Without Docker

```bash
# Single process
node .interactkit/build/src/_entry.js

# Distributed (start each in a separate terminal)
node .interactkit/build/src/_unit-memory.js    # start dependencies first
node .interactkit/build/src/_unit-agent.js
node .interactkit/build/src/_hooks.js
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `REDIS_HOST` | Redis host (default: from config) |
| `REDIS_PORT` | Redis port (default: from config) |
| `DATABASE_URL` | Prisma database URL |
| `NODE_ENV` | Set to `production` in Docker |

---

## Related

- [Infrastructure](./infrastructure.md): configure adapters that determine scaling
- [Codegen](./codegen.md): how the deployment plan is generated
