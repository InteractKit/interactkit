# Deployment

`interactkit build` generates a deployment plan at `.interactkit/generated/deployment.json`. It tells you which entities can scale independently.

## How It Works

It depends on the pub/sub adapter:

| Adapter | Can scale independently? | Why |
|---------|------------------------|-----|
| `InProcessBusAdapter` (default) | No | In-memory, must share a process |
| `RedisPubSubAdapter` | Yes | Communicates over Redis |
| `EntityStream` | No | In-memory data flow |

## Example

```typescript
import { Entity, BaseEntity, Component, RedisPubSubAdapter } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() brain!: Brain;      // InProcess → stays together
  @Component() mouth!: Mouth;      // InProcess → stays together
  @Component() memory!: Memory;    // Redis → can scale separately
}

@Entity({ pubsub: RedisPubSubAdapter })
class Memory extends BaseEntity { /* ... */ }
```

Generated `deployment.json`:

```json
{
  "units": [
    { "name": "unit-agent", "entities": ["agent", "brain", "mouth"], "scalable": false },
    { "name": "unit-memory", "entities": ["memory"], "scalable": true }
  ],
  "connections": [
    { "from": "unit-agent", "to": "unit-memory", "adapter": "RedisPubSubAdapter" }
  ]
}
```

**Units** = entities that must run in the same process.
**Connections** = how units talk to each other.

## Deploying

Feed `deployment.json` to your orchestrator:

- **Docker Compose:** one service per unit, shared Redis
- **Kubernetes:** one deployment per unit, HPA for scalable units
- **Manual:** keep units together, split scalable ones wherever

---

## Related

- [Infrastructure](./infrastructure.md): configure the adapters that determine scaling
- [Codegen](./codegen.md): how the deployment plan is generated
