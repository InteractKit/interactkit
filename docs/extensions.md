# Extensions

Extensions are npm packages that add database adapters, observer UIs, vector stores, and other integrations to InteractKit.

## Available Packages

| Package | What it provides |
|---------|-----------------|
| `@interactkit/prisma` | `PrismaDatabaseAdapter({ url })` -- Prisma-backed state persistence |
| `@interactkit/observer` | `DashboardObserver({ port?, token? })` -- web dashboard UI |
| `@interactkit/chromadb` | `ChromaDBVectorStoreAdapter({ collection, url? })` -- ChromaDB vector store |
| `@interactkit/pinecone` | `PineconeVectorStoreAdapter({ apiKey, index, embed? })` -- Pinecone vector store |
| `@interactkit/langchain` | `LangChainVectorStoreAdapter({ store })` -- wraps any LangChain VectorStore |

## Using an Extension

Install the package and use it in `graph.configure()`:

```bash
pnpm add @interactkit/prisma @interactkit/observer
```

```typescript
import { graph } from '../interactkit/.generated/graph.js';
import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DashboardObserver } from '@interactkit/observer';

const app = graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  observers: [new DashboardObserver()],
});
```

---

## Prisma

Stores entity state as JSON in any Prisma-supported database (SQLite, PostgreSQL, MySQL).

```typescript
import { PrismaDatabaseAdapter } from '@interactkit/prisma';

graph.configure({
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
});
```

Requires an `EntityState` model in your Prisma schema:

```prisma
model EntityState {
  id    String @id
  state String
}
```

---

## Observer Dashboard

Web-based dashboard with entity graph visualization, live event feed, state inspector, and method caller.

```typescript
import { DashboardObserver } from '@interactkit/observer';

graph.configure({
  observers: [new DashboardObserver({ port: 4200 })],
});
// Dashboard at http://localhost:4200
```

---

## Vector Stores

For semantic memory in LLM entities. See [Infrastructure](infrastructure.md#vector-store) for details.

```typescript
import { ChromaDBVectorStoreAdapter } from '@interactkit/chromadb';

graph.configure({
  vectorStore: new ChromaDBVectorStoreAdapter({ collection: 'memories' }),
});
```

| Package | Embeddings |
|---------|-----------|
| `@interactkit/chromadb` | Built-in (zero config) |
| `@interactkit/pinecone` | Bring your own (`embed` fn or LangChain `Embeddings`) |
| `@interactkit/langchain` | Whatever the wrapped store uses |

---

## What's Next?

- [Infrastructure](infrastructure.md) -- custom adapters
- [Deployment](deployment.md) -- HTTP API, Docker
