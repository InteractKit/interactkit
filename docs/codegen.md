# Codegen

`interactkit compile` reads your `interactkit/entities.xml` and generates a fully typed TypeScript library in `interactkit/.generated/`.

## Running It

```bash
interactkit compile         # XML -> TypeScript
interactkit build           # compile + tsc
interactkit dev             # compile + tsc + run + watch
```

## The Pipeline

```
entities.xml
    |
    v
  Parse XML          → intermediate representation
    |
    v
  Expand autotools   → generate CRUD methods for fieldGroups
    |
    v
  Validate           → check refs exist, types match, required fields present
    |
    v
  Fetch remote       → GET /schema from remote entities at compile time
  schemas
    |
    v
  Infer peerVisible  → auto-add refs for LLM entities to see sibling tools
  refs
    |
    v
  Generate           → tree.ts, registry.ts, types.ts, graph.ts, handlers.ts
```

## What Gets Generated

All output goes to `interactkit/.generated/`:

### `tree.ts` -- Entity Graph

The full entity tree as a nested JavaScript object. This is the runtime's source of truth for entity structure, state defaults, methods, refs, components, streams, and hooks.

```typescript
export const entityTree = {
  id: "agent",
  type: "agent",
  className: "Agent",
  describe: "Agent \"{{name}}\"",
  state: [{ name: "name", id: "agent.name", default: "Agent" }],
  components: [
    { id: "agent.brain", propertyName: "brain", entityType: "brain", entity: { /* ... */ } },
  ],
  methods: [
    { methodName: "ask", eventName: "agent.ask", id: "agent.ask", description: "Ask a question" },
  ],
  // ...
} as const;
```

### `registry.ts` -- Zod Schemas

Zod schemas for every entity's state and tool inputs/outputs. Used for runtime validation:

```typescript
export const Registry = {
  entities: {
    'agent': {
      state: z.object({ name: z.string().min(2).max(50) }),
      methods: {
        'agent.ask': {
          input: z.object({ question: z.string() }),
          result: z.string(),
        },
      },
      components: [{ property: 'brain', type: 'brain' }],
      refs: [],
    },
  },
} as const;
```

### `types.ts` -- TypeScript Interfaces

Typed interfaces for every entity, its state, input types, and proxy types:

```typescript
export interface AgentEntity extends Entity {
  state: AgentState;
  components: { brain: BrainProxy; memory: MemoryProxy };
}

export interface AgentProxy {
  ask(input: { question: string }): Promise<string>;
  brain: BrainProxy;
  memory: MemoryProxy;
}

export interface BrainProxy {
  invoke(input: { message: string }): Promise<string>;
}
```

### `graph.ts` -- Runtime Instance

The configured runtime with typed `configure()` method and typed entity proxies:

```typescript
export const graph = new InteractKitGraph();
// graph.configure({ ... }) returns a typed App with:
// app.agent.ask({ question: '...' })
// app.brain.invoke({ message: '...' })
```

### `handlers.ts` -- Handler Imports

Imports all tool handlers from `src` attributes in XML:

```typescript
import _h0 from '../tools/ask.js';
import _h1 from '../tools/speak.js';

export const handlers = {
  Agent: { ask: _h0 },
  Mouth: { speak: _h1 },
};
```

## The `src` Attribute

When a `<tool>` has `src="tools/ask.ts"`, the compiler:
1. Records the path relative to `interactkit/`
2. Generates an import in `handlers.ts`
3. The handler file must export a default function `(entity, input?) => result`

Tools without `src`:
- **On LLM entities**: automatically route to the LLM invoke handler
- **Autotools**: get built-in CRUD handlers (no file needed)
- **Otherwise**: must be provided via `graph.configure({ handlers })` in app.ts

## Build-time Checks

| Problem | Result |
|---------|--------|
| Unknown entity in `<component>` or `<ref>` | Compile error |
| Ref target not a sibling | Compile error |
| LLM entity missing `<executor>` | Compile error |
| Tool `src` file not found | Compile error |
| Duplicate entity names | Compile error |
| Circular component references | Compile error |

---

## What's Next?

- [Entities](entities.md) -- XML element reference
- [Testing](testing.md) -- test with generated graph
