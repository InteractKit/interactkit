# Hooks

Hooks let entities run code at specific lifecycle points. Currently, the primary hook is **init** -- run when an entity boots.

## Init Handler

Register an init handler in `app.ts` or pass it via `graph.configure()`:

```typescript
const app = graph.configure({
  handlers: {
    Agent: {
      init: async (entity) => {
        console.log('Agent booted!', entity.id);
        // Subscribe to child streams
        entity.components.sensor.readings.on('data', (value) => {
          entity.state.sensorReadings.push(value);
        });
      },
    },
  },
});
```

Or register after configuration:

```typescript
app.Agent.init(async (entity) => {
  console.log('Agent ready');
});
```

Init handlers run bottom-up -- children initialize before parents.

## Init via `src`

You can also define init handlers as tool files if your XML defines an init hook:

```xml
<hooks>
  <hook type="init" src="hooks/agent-init.ts" />
</hooks>
```

```typescript
// interactkit/hooks/agent-init.ts
import type { AgentEntity } from '../.generated/types.js';

export default async (entity: AgentEntity): Promise<void> => {
  console.log(`Agent ${entity.state.name} booted`);
};
```

## HTTP and WebSocket

HTTP and WebSocket are handled by `app.serve()` instead of hooks. See [Deployment](deployment.md).

```typescript
await app.serve({
  http: { port: 3000 },
  ws: { port: 3001 },
});
```

---

## What's Next?

- [Deployment](deployment.md) -- HTTP API via `app.serve()`
- [Infrastructure](infrastructure.md) -- database, observers
