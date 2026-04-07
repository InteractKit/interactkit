# Deployment

InteractKit runs as a single Node.js process. Build, start, and optionally expose an HTTP API.

## Build and Run

```bash
interactkit build          # compile XML + TypeScript
interactkit start          # run the built app
```

Or in one step during development:

```bash
interactkit dev            # compile + run + watch
```

## `app.serve()` -- HTTP API

Auto-expose all entity tools as HTTP endpoints:

```typescript
import { graph } from '../interactkit/.generated/graph.js';

const app = graph.configure({ /* ... */ });
await app.boot();
await app.serve({ http: 3000 });
```

### Auto-Generated Routes

Every tool becomes an endpoint:

| Route | Tool |
|-------|------|
| `POST /agent/ask` | `agent.ask({ question })` |
| `GET /agent/readSensor` | `agent.readSensor()` |
| `POST /agent/chat` | `agent.chat({ message })` |
| `POST /brain/invoke` | `brain.invoke({ message })` |

- Tools with input params: `POST /:entityPath/:method` with JSON body
- Tools without input params: `GET /:entityPath/:method`
- LLM entities: `POST /:entityPath/invoke`

### Built-in Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /schema` | Entity tree schema (used by remote entities) |
| `POST /_rpc` | Single RPC endpoint: `{ entity, method, input }` |

### Custom Routes

Override or add routes:

```typescript
await app.serve({
  http: {
    port: 3000,
    cors: true,
    routes: {
      'POST /research': 'pipeline.process',           // alias to entity method
      'GET /health': (req) => ({ status: 'ok' }),      // custom handler
    },
    expose: ['agent.ask', 'agent.chat'],               // whitelist (optional)
    exclude: ['sensor.read'],                          // blacklist (optional)
  },
});
```

### WebSocket Streams

Streams are exposed as WebSocket endpoints:

```typescript
await app.serve({
  http: { port: 3000 },
  ws: { port: 3001 },
});
// ws://localhost:3001/streams/agent.mouth/transcript
// ws://localhost:3001/streams/agent.sensor/readings
```

### ServeConfig

```typescript
interface ServeConfig {
  http?: {
    port?: number;        // default: 3000
    host?: string;        // default: '0.0.0.0'
    cors?: boolean;       // default: false
    expose?: string[];    // whitelist entity methods
    exclude?: string[];   // blacklist entity methods
    routes?: Record<string, string | RouteHandler>;
    tenantFrom?: (req: ServeRequest) => string | undefined | Promise<string | undefined>;
    shared?: string[];    // entity names shared across tenants
    maxTenants?: number;  // LRU pool size (default: unlimited)
    tenantIdleMs?: number; // evict idle tenants (default: 300_000)
  } | number;
  ws?: {
    port?: number;        // default: same as http
  } | number;
}
```

---

## Remote Entities

Distribute your system across multiple services by marking an entity as `remote`:

```xml
<!-- Service A: gateway -->
<entity name="Worker" type="base" description="Remote worker" remote="http://localhost:4100" />
```

```xml
<!-- Service B: worker (standalone) -->
<graph xmlns="https://interactkit.dev/schema/v1" version="1" root="Worker">
  <entity name="Worker" type="base" description="Worker service">
    <tools>
      <tool name="process" description="Process data" src="tools/process.ts">
        <input><param name="data" type="string" /></input>
        <output type="string" />
      </tool>
    </tools>
  </entity>
</graph>
```

The worker runs `app.serve()` to expose its tools:

```typescript
// Worker service
const app = graph.configure({ /* ... */ });
await app.boot();
await app.serve({ http: 4100 });
```

At compile time, the gateway fetches the worker's schema from `http://localhost:4100/schema`. At runtime, all calls to the remote entity go through HTTP via `/_rpc`.

Same code, same types, different processes. No protocol changes needed.

---

## Multi-Tenant

Create isolated entity instances with `app.instance()`:

```typescript
const app = graph.configure({ /* ... */ });
await app.boot();

const alice = await app.instance('alice');
const bob = await app.instance('bob');

await alice.agent.chat({ message: 'hi' });  // alice's state
await bob.agent.chat({ message: 'hi' });    // bob's state
```

Each tenant gets namespaced entity IDs (`alice:agent`, `bob:agent`) and independent state. Handlers are shared.

### Multi-Tenant via `app.serve()`

Use `tenantFrom` in serve config to extract a tenant ID from each HTTP request. Each tenant gets an isolated entity tree with namespaced state, managed in an LRU pool.

```typescript
await app.serve({
  http: {
    port: 3000,
    tenantFrom: (req) => req.headers['x-user-id'],  // sync or async
    shared: ['KnowledgeBase'],  // shared across tenants
    maxTenants: 1000,
    tenantIdleMs: 300_000,
  },
});
```

- `tenantFrom` can be async (JWT verification, DB lookup, etc.)
- If `tenantFrom` returns `undefined`, the request uses the parent app (no isolation)
- `shared` lists entity names that should not be tenant-isolated
- Idle tenants are evicted from the pool via LRU when `maxTenants` is reached
- WebSocket connections can be tenant-scoped: `ws://host/tenantId/streams/agent/transcript`

---

## Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
CMD ["pnpm", "start"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
```

---

## What's Next?

- [Infrastructure](infrastructure.md) -- database and observer setup
- [Testing](testing.md) -- test before deploying
