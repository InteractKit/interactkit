# @interactkit/sdk

Runtime for InteractKit. Boots entity graphs compiled from XML, manages state persistence, event routing, LLM integration, HTTP serving, and multi-tenancy.

## Install

```bash
npm install @interactkit/sdk
```

## Usage

The CLI compiles your `entities.xml` into a typed `graph` object. Your app code configures and boots it:

```typescript
import { graph } from '../interactkit/.generated/graph.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevObserver } from '@interactkit/sdk';

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./app.db' }),
  observers: [new DevObserver()],
  timeout: 15_000,
  stateFlushMs: 50,
});

await app.boot();
```

## API

### `graph.configure(config)`

Creates a configured app instance. Config options:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `database` | `DatabaseAdapter` | required | State persistence (get/set/delete) |
| `vectorStore` | `VectorStoreAdapter` | `undefined` | Vector store for long-term-memory entities |
| `observers` | `ObserverAdapter[]` | `[]` | Event observability |
| `timeout` | `number` | `30000` | Event bus request timeout (ms) |
| `stateFlushMs` | `number` | `50` | State persistence debounce (ms) |
| `handlers` | `HandlerMap` | `{}` | Additional tool handlers (override src-defined ones) |

### `app.boot()`

Boots the entity graph: creates instances, hydrates state from database, wires refs/components, initializes LLM executors, calls init handlers (bottom-up).

```typescript
await app.boot();
await app.boot({ strict: true });  // throws if any tool is missing a handler
```

### `app.serve(config)`

Auto-exposes all tools as HTTP endpoints + WebSocket for streams:

```typescript
await app.serve({
  http: {
    port: 3000,
    cors: true,
    expose: ['agent.*'],          // whitelist
    exclude: ['agent.brain.*'],   // blacklist
    routes: {
      'POST /ask': 'agent.ask',   // custom alias
      'GET /health': async () => ({ ok: true }),  // custom handler
    },
  },
  ws: { port: 3001 },
});
```

Built-in endpoints:
- `GET /schema` -- entity tree for remote discovery
- `POST /_rpc` -- single RPC endpoint (`{ entity, method, input }`)

#### Multi-tenant via `tenantFrom`

```typescript
await app.serve({
  http: {
    port: 3000,
    tenantFrom: (req) => req.headers['x-user-id'],  // sync or async
    shared: ['KnowledgeBase'],
    maxTenants: 1000,
    tenantIdleMs: 300_000,
  },
});
```

Each request is routed to an isolated tenant instance. `tenantFrom` can be async (JWT, DB lookup). No tenant = parent app. LRU eviction for idle tenants. WebSocket: `ws://host/tenantId/streams/...`.

### `app.call(entityPath, method, input?)`

Call any entity method programmatically:

```typescript
const answer = await app.call('agent', 'agent.ask', { question: 'hello' });
```

Or use the typed proxy:

```typescript
const answer = await app.agent.ask({ question: 'hello' });
```

### `app.instance(tenantId)`

Create an isolated tenant instance with independent state:

```typescript
const alice = await app.instance('alice');
const bob = await app.instance('bob');

await alice.agent.ask({ question: 'hi' });  // isolated state
await bob.agent.ask({ question: 'hi' });    // isolated state
```

### `app.on(entityType, method, listener)`

Subscribe to entity method calls:

```typescript
app.on('agent', 'ask', (input, result) => {
  console.log('ask called with', input, 'returned', result);
});
```

### `app.onStream(entityPath, streamName, fn)`

Subscribe to entity streams:

```typescript
app.onStream('agent.mouth', 'transcript', (text) => {
  console.log('Spoken:', text);
});
```

### `app.stop()`

Flush state and shut down:

```typescript
await app.stop();
```

## Testing

```typescript
import { graph } from '../interactkit/.generated/graph.js';
import { createTestApp } from '@interactkit/sdk/test';

const app = await createTestApp(graph, {
  handlers: {
    Memory: { store: async (e, i) => 'mock-id' },
  },
  state: {
    agent: { count: 10 },
  },
});

const result = await app.agent.ask({ question: 'test' });
await app.stop();
```

`createTestApp` boots with an in-memory database. Override handlers and pre-seed state for unit tests.

## Adapters

### Shipped with SDK

| Adapter | Type | Notes |
|---------|------|-------|
| `InProcessBusAdapter` | Local pub/sub | Default, zero-latency |
| `DevObserver` | Observer | Colored dev-mode output |
| `ConsoleObserver` | Observer | Plain stdout/stderr |

### Extension packages

| Package | Adapter | Description |
|---------|---------|-------------|
| `@interactkit/prisma` | `PrismaDatabaseAdapter` | Prisma-backed state persistence |
| `@interactkit/redis` | `RedisPubSubAdapter` | Redis pub/sub for distributed entities |
| `@interactkit/chromadb` | `ChromaDBVectorStoreAdapter` | ChromaDB with built-in embeddings |
| `@interactkit/pinecone` | `PineconeVectorStoreAdapter` | Pinecone (bring your own embeddings) |
| `@interactkit/langchain` | `LangChainVectorStoreAdapter` | Wraps any LangChain VectorStore |

## Long-Term Memory Entities

Entities with `type="long-term-memory"` get auto-registered handlers when `vectorStore` is configured. No handler code needed.

```xml
<entity name="Memory" type="long-term-memory" description="Semantic memory" />
```

Auto-generated tools: `memorize`, `recall`, `forget`. When attached as a component to an LLM entity, tools become LLM-visible (`memory_memorize`, `memory_recall`, `memory_forget`).

## Adapter Interfaces

```typescript
interface VectorStoreAdapter {
  add(docs: VectorDocument[]): Promise<string[]>;
  search(query: string, k: number, filter?: Record<string, unknown>): Promise<ScoredDocument[]>;
  delete(params: DeleteParams): Promise<void>;
}

interface DatabaseAdapter {
  get(id: string): Promise<Record<string, unknown> | null>;
  set(id: string, state: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
}

interface ObserverAdapter {
  event(envelope: EventEnvelope): void;
  error(envelope: EventEnvelope, error: Error): void;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  setState(id: string, field: string, value: unknown): void;
  getState(id: string, field: string): Promise<unknown>;
  callMethod(id: string, method: string, payload?: unknown): Promise<unknown>;
  getEntityTree(): Promise<EntityTree>;
}
```
