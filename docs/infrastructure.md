# Infrastructure

InteractKit uses pluggable adapters for database and observability. All infrastructure is configured via `graph.configure()` in `app.ts`.

## Setup

```typescript
import { graph } from '../interactkit/.generated/graph.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DashboardObserver } from '@interactkit/observer';
import { DevObserver } from '@interactkit/sdk';

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  observers: [new DevObserver(), new DashboardObserver()],
  timeout: 15_000,
  stateFlushMs: 50,
});
```

## RuntimeConfig

| Option | Default | Description |
|--------|---------|-------------|
| `database` | In-memory | Database adapter for state persistence |
| `vectorStore` | `undefined` | Vector store adapter for long-term-memory entities |
| `observers` | `[]` | Observer adapters for event logging |
| `timeout` | `30000` | Event bus request timeout (ms) |
| `stateFlushMs` | `50` | State persistence debounce (ms) |
| `handlers` | `{}` | Handler overrides keyed by entity class name or path |

---

## Database

### In-Memory (Default)

No configuration needed. State lives in memory and is lost on restart. Good for development and testing.

### Prisma

```bash
pnpm add @interactkit/prisma
```

```typescript
import { PrismaDatabaseAdapter } from '@interactkit/prisma';

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
});
```

Requires an `EntityState` model in your Prisma schema:

```prisma
datasource db {
  provider = "sqlite"   // or "postgresql"
  url      = "file:./interactkit.db"
}

model EntityState {
  id    String @id
  state String
}
```

State persistence is automatic -- entity state saves to DB on mutation (debounced) and restores on boot.

### Custom Database Adapter

```typescript
import type { DatabaseAdapter } from '@interactkit/sdk';

class MyDatabase implements DatabaseAdapter {
  async get(entityId: string): Promise<Record<string, unknown> | null> { /* ... */ }
  async set(entityId: string, state: Record<string, unknown>): Promise<void> { /* ... */ }
  async delete(entityId: string): Promise<void> { /* ... */ }
}
```

---

## Observers

Observers see all events flowing through the entity tree -- tool calls, errors, state changes.

| Observer | Package | Output |
|----------|---------|--------|
| `DevObserver` | `@interactkit/sdk` | Colored terminal output |
| `DashboardObserver` | `@interactkit/observer` | Web dashboard on `http://localhost:4200` |

```typescript
import { DevObserver } from '@interactkit/sdk';
import { DashboardObserver } from '@interactkit/observer';

const app = graph.configure({
  observers: [new DevObserver(), new DashboardObserver({ port: 4200 })],
});
```

Multiple observers can run simultaneously.

### Custom Observer

```typescript
import { BaseObserver } from '@interactkit/sdk';
import type { EventEnvelope } from '@interactkit/sdk';

class MyObserver extends BaseObserver {
  event(envelope: EventEnvelope): void {
    // Log or process every event
  }
  error(envelope: EventEnvelope, error: Error): void {
    // Log or process errors
  }
}
```

---

## Vector Store

For semantic memory (RAG), configure a vector store adapter:

```typescript
import { ChromaDBVectorStoreAdapter } from '@interactkit/chromadb';

const app = graph.configure({
  vectorStore: new ChromaDBVectorStoreAdapter({ collection: 'agent-memory' }),
});
```

| Package | Adapter | Notes |
|---------|---------|-------|
| `@interactkit/chromadb` | `ChromaDBVectorStoreAdapter` | Built-in embeddings, zero config |
| `@interactkit/pinecone` | `PineconeVectorStoreAdapter` | Requires embedding function |
| `@interactkit/langchain` | `LangChainVectorStoreAdapter` | Wraps any LangChain VectorStore |

### VectorStoreAdapter Interface

```typescript
interface VectorDocument {
  id?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface ScoredDocument {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface DeleteParams {
  ids?: string[];
  filter?: Record<string, unknown>;
}

interface VectorStoreAdapter {
  add(docs: VectorDocument[]): Promise<string[]>;
  search(query: string, k: number, filter?: Record<string, unknown>): Promise<ScoredDocument[]>;
  delete(params: DeleteParams): Promise<void>;
}
```

### Custom Vector Store

```typescript
import type { VectorStoreAdapter, VectorDocument, ScoredDocument, DeleteParams } from '@interactkit/sdk';

class MyVectorStore implements VectorStoreAdapter {
  async add(docs: VectorDocument[]): Promise<string[]> { /* ... */ }
  async search(query: string, k: number, filter?: Record<string, unknown>): Promise<ScoredDocument[]> { /* ... */ }
  async delete(params: DeleteParams): Promise<void> { /* ... */ }
}
```

When a `vectorStore` is configured, the runtime auto-registers handlers for any `type="long-term-memory"` entities. See [Entities](entities.md) for details.

---

## What the Adapters Control

| Feature | Adapter |
|---------|---------|
| State persistence | Database |
| Semantic memory (RAG) | Vector Store |
| Event observability | Observer |
| Tool calls between entities | Event Bus (built-in) |

---

## What's Next?

- [Deployment](deployment.md) -- HTTP API, Docker, remote entities
- [Extensions](extensions.md) -- available adapter packages
