# @interactkit/sdk

XML-driven entity graph runtime. Zero decorators, zero ts-morph. Entities are defined in XML, compiled by the CLI, and executed by this runtime.

## Overview

```
 XML (authored)         CLI Compiler             SDK Runtime
 --------------         ------------             -----------
 <entity>               parse XML → IR           InteractKitRuntime boots
 <state>                validate                  entity graph from generated
 <tools>           →    expand autotools     →    tree.ts + registry.ts
 <executor>             infer refs                Entity instances, reactive
 <component>            generate TS               state, event bus, LLM loops
```

---

## 1. Core Classes

### InteractKitRuntime

Constructed with a generated entity tree and registry. Manages entity lifecycle, handler registration, event routing, and the typed proxy system.

```typescript
const runtime = new InteractKitRuntime(entityTree, Registry);
const app = runtime.configure({
  database: db,
  observers: [new DevObserver()],
  timeout: 15_000,
  stateFlushMs: 50,
  handlers: {
    Worker: { process: async (entity, input) => { ... } },
  },
});
```

### InteractKitApp

Returned by `runtime.configure()`. The bootable, handler-registrable instance.

| Method | Purpose |
|--------|---------|
| `boot(opts?)` | Hydrate state, wire refs/components, init LLM executors, call init handlers (bottom-up) |
| `stop()` | Flush state, destroy event bus |
| `serve(config)` | Auto-expose tools as HTTP endpoints + WebSocket streams |
| `instance(tenantId)` | Create isolated tenant with namespaced entity IDs and independent state |
| `call(path, method, input?)` | Call any entity method through the event bus (or HTTP for remote entities) |
| `addHandler(entity, method, fn)` | Register handler by entity type or entity path (path overrides type) |
| `on(entity, method, fn)` | Subscribe to events on an entity method |
| `onStream(path, streamName, fn)` | Subscribe to a stream on an entity |

### Entity

Thin runtime object for each node in the entity graph. Handlers receive this.

```typescript
class Entity {
  readonly id: string;       // e.g. "agent" or "agent.brain"
  readonly type: string;     // kebab-case entity type
  state: Record<string, any>;
  refs: Record<string, any>;
  components: Record<string, any>;
  streams: Record<string, { emit(data: any): void }>;
  secrets: Record<string, string>;
  async call(target, method, input?);  // dynamic routing via event bus
  async save();                        // force-persist state to DB
}
```

### RuntimeConfig

```typescript
interface RuntimeConfig {
  database: DatabaseAdapter;
  vectorStore?: VectorStoreAdapter;  // for long-term-memory entities
  observers?: ObserverAdapter[];
  timeout?: number;          // event bus request timeout (default: 30000ms)
  stateFlushMs?: number;     // reactive state flush debounce (default: 50ms)
  handlers?: HandlerMap;     // keyed by entity type (e.g. 'Worker') or path (e.g. 'agent.worker')
}
```

---

## 2. EntityNode Tree Structure

The generated `tree.ts` defines the full entity graph as a nested `EntityNode`. This is the runtime's source of truth for entity structure.

```typescript
interface EntityNode {
  id: string;                // dot-separated path (e.g. "agent.brain")
  type: string;              // kebab-case type
  className: string;
  describe?: string;         // template with {{state.field}} interpolation
  infra: { remote?: string };
  state: Array<{ name: string; id: string; default?: any }>;
  refs: Array<{ propertyName: string; targetEntityType: string; id: string }>;
  components: Array<{ id: string; propertyName: string; entityType: string; entity?: EntityNode }>;
  streams: Array<{ propertyName: string; id: string }>;
  methods: Array<{ methodName: string; eventName: string; id: string; description?: string; auto?: string; on?: string; key?: string }>;
  hooks: Array<{ methodName: string; hookTypeName: string; inProcess: boolean; id: string }>;
  executor?: ExecutorConfig;
}
```

---

## 3. Reactive State

Entity state is wrapped in a reactive proxy that auto-flushes to the database on mutation. Tracks shallow property sets and intercepts array mutators (push, pop, splice, etc.). For deep nested mutations, call `entity.save()` manually.

```typescript
createReactiveState(initial, { entityId, db, flushMs, observer });
flushReactiveState(state, entityId, db);  // immediate flush (used at shutdown)
```

---

## 4. app.serve() — HTTP + WebSocket

Auto-exposes entity tools as HTTP endpoints.

**Auto-generated routes:**
- `POST /:entityPath/:method` -- tools with input params
- `GET /:entityPath/:method` -- tools without input params
- `POST /:entityPath/invoke` -- LLM entity invoke

**Built-in endpoints:**
- `GET /schema` -- entity tree schema for remote discovery
- `POST /_rpc` -- single endpoint for remote entity calls (`{ entity, method, input }`)

**WebSocket** (requires `ws` package):
- `ws://host:port/streams/:entityPath/:streamName` -- live stream data
- `ws://host:port/call/:entityPath/:method` -- tool call over WebSocket

**Multi-tenant via `tenantFrom`:**

`tenantFrom` in serve config extracts a tenant ID from each request. Each tenant gets an isolated entity tree with namespaced state, managed in an LRU pool.

```typescript
await app.serve({
  http: {
    port: 3000,
    tenantFrom: (req) => req.headers['x-user-id'],
    shared: ['KnowledgeBase'],
    maxTenants: 1000,
    tenantIdleMs: 300_000,
  },
});
```

- `tenantFrom` can be async (JWT verification, DB lookup)
- No tenant header = uses parent app
- WebSocket tenant-scoped: `ws://host/tenantId/streams/...`

**ServeConfig:**

```typescript
interface ServeConfig {
  http?: { port?, host?, cors?, expose?, exclude?, routes?, tenantFrom?, shared?, maxTenants?, tenantIdleMs? } | number;
  ws?: { port? } | number;
}
```

Custom routes override auto-generated ones. Route aliases map to entity methods (`'POST /research': 'pipeline.process'`). Route handlers receive `ServeRequest { method, path, body, headers, query }`.

---

## 5. Remote Entities

Entities with `remote` attribute in XML are proxied over HTTP. At runtime, calls to remote entities go through `/_rpc` on the remote service. Schema is fetched at compile time from the remote's `/schema` endpoint.

```typescript
// Runtime auto-routes: if entity or any ancestor has remote set,
// calls go via HTTP POST to remote_url/_rpc
async callRemote(baseUrl, entityPath, method, input);
```

---

## 6. Multi-Tenant — app.instance(tenantId)

Creates an isolated tenant with namespaced entity IDs (`tenantId:entityPath`) and independent state. Handlers are shared, state is isolated.

```typescript
const alice = await app.instance('alice');
const bob = await app.instance('bob');
await alice.call('agent', 'chat', { message: 'hi' }); // alice's state
await bob.call('agent', 'chat', { message: 'hi' });   // bob's state
```

---

## 7. LLM Support

LLM entities (type="llm" in XML) get an auto-created executor and an `invoke` handler.

**Executor creation** (`createExecutor`): dynamically imports LangChain package based on provider (openai, anthropic, google, ollama).

**Tool collection** (`collectLLMTools`): gathers all tools visible to the LLM entity -- own methods, ref tools (prefixed `refName_method`), and component tools (prefixed `compName_method`).

**Invoke handler** (`createInvokeHandler`): receives a message, builds system prompt from `describe` template, runs the LLM tool-use loop with collected tools, returns the result. Context persists across invocations per entity.

**LLMContext**: manages conversation history (system prompt + messages). Used by the invoke handler.

**runLLMLoop**: executes the LLM tool-use loop -- binds tools to executor, calls LLM, processes tool calls, repeats until text response or max iterations.

---

## 8. Long-Term Memory Handlers

Entities with `type="long-term-memory"` get auto-registered handlers at boot when `vectorStore` is in RuntimeConfig. The runtime creates three handlers:

| Handler | VectorStoreAdapter method |
|---------|--------------------------|
| `memorize` | `add()` |
| `recall` | `search()` |
| `forget` | `delete()` |

No user code needed. Typed signatures are generated by the compiler (`{Entity}MemorizeInput`, `{Entity}RecallInput`, `{Entity}ForgetInput`). State is tenant-isolated via entity ID namespacing.

When attached as a component to an LLM entity, tools become LLM-visible with prefixed names (`memory_memorize`, `memory_recall`, `memory_forget`).

---

## 9. Auto Handlers (CRUD)

Tools with `auto` attribute get built-in CRUD handlers that operate on entity state arrays:

| Operation | Behavior |
|-----------|----------|
| `create` | Push new item with auto-generated ID + timestamps |
| `read` | Find item by key field |
| `update` | Merge input into existing item by key |
| `delete` | Filter out item by key |
| `list` | Return copy of array |
| `search` | Case-insensitive substring search |
| `count` | Return array length |

---

## 10. Event Bus

Request/response event bus over a PubSubAdapter. Uses correlation IDs for matching replies. Separate channels for error and payload responses. Configurable timeout (default 30s).

```typescript
class EventBus {
  request(envelope: EventEnvelope): Promise<unknown>;
  listen(entityId, handler): Promise<void>;
  publish(envelope): Promise<void>;
  destroy(): Promise<void>;
}
```

---

## 11. Adapter Interfaces

### PubSubAdapter

```typescript
abstract class PubSubAdapter {
  abstract publish(channel, message): Promise<void>;
  abstract subscribe(channel, handler): Promise<void>;
  abstract unsubscribe(channel): Promise<void>;
  abstract enqueue(channel, message): Promise<void>;
  abstract consume(channel, handler): Promise<void>;
  abstract stopConsuming(channel): Promise<void>;
}
```

- **LocalPubSubAdapter** -- passes values by reference, no serialization. `InProcessBusAdapter` extends this.
- **RemotePubSubAdapter** -- JSON serialization. Subclasses implement raw string transport methods (`publishRaw`, `subscribeRaw`, etc.). No proxy system in v4 -- all values must be JSON-serializable.

### DatabaseAdapter

```typescript
interface DatabaseAdapter {
  get(entityId: string): Promise<Record<string, unknown> | null>;
  set(entityId: string, state: Record<string, unknown>): Promise<void>;
  delete(entityId: string): Promise<void>;
}
```

### ObserverAdapter

```typescript
interface ObserverAdapter {
  event(envelope: EventEnvelope): void;
  error(envelope: EventEnvelope, error: Error): void;
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  setState(entityId: string, field: string, value: unknown): void;
  getState(entityId: string, field: string): Promise<unknown>;
  callMethod(entityId: string, method: string, payload?: unknown): Promise<unknown>;
  getEntityTree(): Promise<EntityNode>;
}
```

---

## 12. Testing — createTestApp()

```typescript
import { createTestApp } from '@interactkit/sdk/test';

const app = await createTestApp(graph, {
  handlers: { Worker: { process: async (e, i) => 'mocked' } },
  state: { 'agent.worker': { count: 5 } },
});

const result = await app.call('agent.worker', 'worker.process', { data: 'test' });
await app.stop();
```

Uses an in-memory database (Map-based). Returns the app with a `db` property for state inspection in tests.

---

## 13. Design Rules

1. **No decorators** -- entities are defined in XML, not TypeScript classes.
2. **No base classes** -- entity handlers are plain functions `(entity: Entity, input?) => result`.
3. **Handlers by type or path** -- type handlers are shared across instances, path handlers override for specific instances.
4. **Entity IDs are dot-separated paths** -- e.g. `agent.brain.memory`. Scoped to parent.
5. **State is reactive** -- mutations auto-flush to database with configurable debounce.
6. **Remote entities use HTTP** -- calls go through `/_rpc`, schema fetched at compile time.
7. **LLM entities auto-invoke** -- tools without handlers on LLM entities automatically route to the `invoke` handler.
8. **Entity set is static** -- all entity instances are defined at build time. No dynamic spawning.
9. **Init handlers run bottom-up** -- children initialize before parents.

---

## File Structure

```
src/
  index.ts               # Barrel exports
  runtime.ts             # InteractKitRuntime, InteractKitApp, EntityNode, RuntimeConfig
  serve.ts               # app.serve() — HTTP endpoints, /_rpc, /schema, WebSocket streams
  entity.ts              # Entity class (id, type, state, refs, components, streams, secrets)
  reactive.ts            # createReactiveState, flushReactiveState (dirty tracking + debounced DB flush)
  test.ts                # createTestApp, createMemoryDb, assertEq, assert
  llm/
    llm.ts               # createExecutor, collectLLMTools, createInvokeHandler
    context.ts           # LLMContext (conversation history management)
    utils.ts             # runLLMLoop (tool-use loop execution)
  events/
    bus.ts               # EventBus (request/response over PubSubAdapter)
    types.ts             # EventEnvelope type
  pubsub/
    adapter.ts           # PubSubAdapter, LocalPubSubAdapter, RemotePubSubAdapter
    in-process.ts        # InProcessBusAdapter (extends LocalPubSubAdapter)
  database/
    adapter.ts           # DatabaseAdapter interface
  observer/
    adapter.ts           # ObserverAdapter interface
    base.ts              # BaseObserver abstract base
    dev.ts               # DevObserver (colored dev-mode output)
```

## Dependencies

**Runtime (bundled):**

| Package | Role |
|---------|------|
| `zod` | Re-exported as `z` for generated code |
| `@langchain/core` | LLM integration (BaseChatModel, bindTools, invoke) |

**Optional peer dependencies (for LLM providers):**

| Package | Provider |
|---------|----------|
| `@langchain/openai` | OpenAI |
| `@langchain/anthropic` | Anthropic |
| `@langchain/google-genai` | Google |
| `@langchain/ollama` | Ollama |
