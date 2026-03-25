# Deployment Planning

`interactkit build` generates `.interactkit/generated/deployment.json` — a deployment plan that tells you which entities can be scaled independently and which must be co-located.

## How it works

The CLI analyzes each entity's `pubsub` adapter to determine co-location requirements:

| Adapter | Co-location | Scalable |
|---------|-------------|----------|
| `InProcessBusAdapter` (default) | Must share process with parent/siblings | No |
| `RedisPubSubAdapter` | Can run on separate machine | Yes |
| `EntityStream` | Must share process (in-memory data flow) | No |

## Example

```typescript
@Entity({ type: 'agent' })
class Agent extends BaseEntity {
  @Component() brain!: Brain;      // inherits InProcess
  @Component() mouth!: Mouth;      // inherits InProcess
  @Component() memory!: Memory;    // overrides to Redis → can scale
  @Component() sensor!: Sensor;    // has EntityStream → must be co-located
}

@Entity({ type: 'memory', pubsub: RedisPubSubAdapter })
class Memory extends BaseEntity { ... }
```

**Generated `deployment.json`:**

```json
{
  "totalEntities": 5,
  "units": [
    {
      "name": "unit-agent",
      "entities": ["agent", "brain", "mouth", "sensor"],
      "reason": "InProcessBusAdapter requires co-location; EntityStream requires co-location",
      "scalable": false,
      "busAdapter": "InProcessBusAdapter"
    },
    {
      "name": "unit-memory",
      "entities": ["memory"],
      "reason": "default grouping",
      "scalable": true,
      "busAdapter": "RedisPubSubAdapter"
    }
  ],
  "connections": [
    {
      "from": "unit-agent",
      "to": "unit-memory",
      "adapter": "RedisPubSubAdapter",
      "methods": ["memory.store", "memory.search", "memory.getAll", "memory.count"]
    }
  ]
}
```

## Deployment units

A **unit** is a group of entities that must run in the same process. The planner groups entities based on:

1. **InProcess bus** — entities using `InProcessBusAdapter` are grouped with their parent
2. **EntityStream** — streams are in-memory, requiring co-location with the parent
3. **@Ref siblings** — if both ref and target use InProcess, they must be co-located

## Connections

**Connections** describe cross-unit communication — which methods flow between units and via which adapter. Use this to:

- Configure network policies (only allow traffic between connected units)
- Set up monitoring on cross-unit method calls
- Estimate Redis channel usage

## Scaling

Units marked `"scalable": true` can be horizontally scaled:

- Deploy multiple replicas behind Redis pub/sub
- Each replica handles a subset of entity instances
- The event bus routes messages by entity ID

Units marked `"scalable": false` run as a single instance. Scale vertically if needed.

## Using the plan

Feed `deployment.json` to your orchestrator:

**Docker Compose** — one service per unit, shared Redis for connections
**Kubernetes** — one deployment per unit, `scalable: true` units get HPA
**Manual** — run co-located units on the same machine, distributed units wherever

## Configuration

Adapters read config from `node-config` or environment variables:

**`config/default.json`:**
```json
{
  "interactkit": {
    "redis": { "host": "127.0.0.1", "port": 6379 },
    "database": { "url": "file:./interactkit.db" }
  }
}
```

**Or env vars:**
```bash
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@host:5432/db
```

No defaults — missing config throws at startup.
