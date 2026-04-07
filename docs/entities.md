# Entities

An entity is a node in your application graph. It has state, tools, and optionally children (components) or sibling references (refs). Everything is defined in `interactkit/entities.xml`.

## Entity Types

| Type | XML | Purpose |
|------|-----|---------|
| Base | `type="base"` | Standard entity with state and tools |
| LLM | `type="llm"` | Entity with an LLM executor, gets `invoke()` automatically |
| Long-Term Memory | `type="long-term-memory"` | Vector store entity with auto-generated memorize/recall/forget tools |
| MCP | `type="mcp"` | Model Context Protocol server (planned) |

## Defining an Entity

```xml
<entity name="Memory" type="base" description="Key-value memory store">
  <describe>Memory -- {{entries.length}} entries (capacity: {{capacity}})</describe>
  <state>
    <field name="capacity" type="number" description="Max entries" default="100" />
    <fieldGroup name="entries" key="id">
      <field name="text" type="string" description="Entry content" />
    </fieldGroup>
  </state>
  <tools>
    <autotool name="store" on="entries" op="create" peerVisible="true" />
    <autotool name="search" on="entries" op="search" key="query" peerVisible="true" />
    <autotool name="getAll" on="entries" op="list" peerVisible="true" />
    <autotool name="count" on="entries" op="count" peerVisible="true" />
  </tools>
</entity>
```

---

## Describe Templates

The `<describe>` element provides a dynamic description of the entity. It supports `{{fieldName}}` interpolation with entity state. On LLM entities, describe output feeds into the system prompt.

```xml
<describe>Sensor "{{label}}" -- {{readingCount}} readings</describe>
```

---

## State

### Fields

Simple state fields with type, default, and optional validation:

```xml
<state>
  <field name="name" type="string" description="Agent name" default="Atlas">
    <validate min-length="2" max-length="50" />
  </field>
  <field name="count" type="number" description="Message count" default="0">
    <validate min="0" max="10000" />
  </field>
  <field name="tags" type="array" description="Tags" items="string" />
</state>
```

| Attribute | Values |
|-----------|--------|
| `type` | `string`, `number`, `boolean`, `array`, `object` |
| `default` | Initial value |
| `items` | Array item type (when `type="array"`) |
| `configurable` | `"true"` to make editable in UI |
| `configurable-label` | Display label |
| `configurable-group` | UI grouping |
| `secret` | `"true"` to mask in UIs and logs |

### Field Groups

Collections of structured items with an auto-generated `id` field. Used with autotools for zero-code CRUD:

```xml
<fieldGroup name="notes" key="id">
  <field name="title" type="string" description="Note title" />
  <field name="content" type="string" description="Note content" />
  <field name="tags" type="array" description="Tags" items="string" />
</fieldGroup>
```

Each item in a fieldGroup automatically gets an `id`, `createdAt`, and `updatedAt` field.

---

## Tools

Tools are the entity's public API. Define them with explicit input/output schemas:

```xml
<tools>
  <tool name="ask" description="Ask a question" src="tools/ask.ts">
    <input><param name="question" type="string" /></input>
    <output type="string" />
  </tool>
</tools>
```

### The `src` Attribute

Points to a TypeScript file with the handler implementation. The file exports a default async function:

```typescript
// interactkit/tools/ask.ts
import type { AgentEntity, AgentAskInput } from '../.generated/types.js';

export default async (entity: AgentEntity, input: AgentAskInput): Promise<string> => {
  const answer = await entity.components.brain.invoke({ message: input.question });
  return answer;
};
```

The handler receives:
- `entity` -- the entity instance with typed `state`, `components`, `refs`, `streams`
- `input` -- the validated input object

### Tools Without `src`

Tools without a `src` attribute on LLM entities automatically route to the LLM's `invoke()` handler. The LLM decides how to respond.

### `peerVisible`

On an LLM entity's refs and components, tools marked `peerVisible="true"` are visible to the LLM during invocation. The LLM can call them as part of its reasoning loop.

```xml
<tool name="speak" description="Speak a message" peerVisible="true" src="tools/speak.ts">
  <input><param name="message" type="string" /></input>
  <output type="void" />
</tool>
```

### Autotools

Autotools generate CRUD handlers automatically for fieldGroups. Zero handler code needed:

```xml
<autotool name="addNote" on="notes" op="create" peerVisible="true" />
<autotool name="getNote" on="notes" op="read" key="id" peerVisible="true" />
<autotool name="updateNote" on="notes" op="update" key="id" peerVisible="true" />
<autotool name="deleteNote" on="notes" op="delete" key="id" peerVisible="true" />
<autotool name="listNotes" on="notes" op="list" peerVisible="true" />
<autotool name="searchNotes" on="notes" op="search" key="query" peerVisible="true" />
<autotool name="countNotes" on="notes" op="count" peerVisible="true" />
```

| Operation | Behavior |
|-----------|----------|
| `create` | Push new item with auto-generated ID + timestamps |
| `read` | Find item by key field |
| `update` | Merge input into existing item by key |
| `delete` | Remove item by key |
| `list` | Return all items |
| `search` | Case-insensitive substring search |
| `count` | Return item count |

---

## Components

Components are child entities. The parent owns them:

```xml
<entity name="Agent" type="base" description="Root agent">
  <components>
    <component name="brain" entity="Brain" />
    <component name="memory" entity="Memory" />
    <component name="sensor" entity="Sensor" />
  </components>
</entity>
```

In handlers, access components via `entity.components`:

```typescript
const answer = await entity.components.brain.invoke({ message: 'hello' });
await entity.components.memory.store({ text: answer });
```

---

## Refs

Refs are sibling references -- a child entity referencing another child of the same parent. Used so that LLM entities can see sibling tools:

```xml
<entity name="Brain" type="llm" description="LLM brain">
  <executor provider="openai" model="gpt-4o-mini" />
  <refs>
    <ref name="memory" entity="Memory" />
    <ref name="mouth" entity="Mouth" />
  </refs>
</entity>
```

The compiler automatically infers `peerVisible` refs -- all siblings of an LLM entity become refs so their `peerVisible` tools are available to the LLM.

In handlers, access refs via `entity.refs`:

```typescript
await entity.refs.memory.store({ text: 'hello' });
```

---

## Streams

Streams let entities push real-time data to parents or WebSocket clients:

```xml
<streams>
  <stream name="readings" type="number" description="Sensor readings" />
  <stream name="changes" type="object" description="Change events">
    <param name="type" type="string" />
    <param name="noteId" type="string" />
  </stream>
</streams>
```

Emit from a handler:

```typescript
entity.streams.transcript.emit('Hello world');
```

Subscribe from a parent handler:

```typescript
// In the parent's init handler
entity.components.sensor.readings.on('data', (value) => {
  console.log('Reading:', value);
});
```

Streams are also exposed as WebSocket endpoints via `app.serve()`.

---

## Secrets

Mark a field as secret to mask it in UIs and logs:

```xml
<field name="apiKey" type="string" description="API key" secret="true" />
```

Access in handlers via `entity.secrets`:

```typescript
const key = entity.secrets.apiKey;
```

---

## Long-Term Memory Entities

Set `type="long-term-memory"` on an entity to get auto-generated semantic memory tools. No handler code needed.

```xml
<entity name="Memory" type="long-term-memory" description="Semantic memory" />
```

The compiler auto-expands this into three tools:

| Tool | Description |
|------|-------------|
| `memorize` | Store a document in the vector store |
| `recall` | Semantic search over stored documents |
| `forget` | Delete documents by ID or filter |

Typed signatures are auto-generated (`MemoryMemorizeInput`, `MemoryRecallInput`, `MemoryForgetInput`).

At runtime, handlers are auto-registered when `vectorStore` is present in `graph.configure()`:

```typescript
import { ChromaDBVectorStoreAdapter } from '@interactkit/chromadb';

const app = graph.configure({
  database: db,
  vectorStore: new ChromaDBVectorStoreAdapter({ collection: 'memory' }),
});
```

Works with ChromaDB, Pinecone, and LangChain adapters. State is tenant-isolated via entity ID namespacing.

When attached as a component to an LLM entity, the tools become LLM-visible (`memory_memorize`, `memory_recall`, `memory_forget`):

```xml
<entity name="Agent" type="llm" description="Agent with memory">
  <executor provider="openai" model="gpt-4o-mini" />
  <components>
    <component name="memory" entity="Memory" />
  </components>
</entity>

<entity name="Memory" type="long-term-memory" description="Semantic memory" />
```

---

## Entity IDs

Every entity gets a dot-separated path ID scoped to its parent:

```
agent
agent.brain
agent.memory
agent.brain  (if brain has children: agent.brain.subchild)
```

---

## What's Next?

- [LLM Entities](llm.md) -- executor config, invoke, tool visibility
- [Hooks](hooks.md) -- init handlers
- [Infrastructure](infrastructure.md) -- database, observers
