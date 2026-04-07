# Why InteractKit

Most AI frameworks give you one agent with a list of tools. That works for a chatbot, but not for a team of 10 agents that delegate to each other, a content pipeline with research-write-review stages, or an autonomous system that watches, decides, and acts on its own.

These need **architecture**, not a bigger tool list.

---

## XML + TypeScript

InteractKit separates structure from logic:

- **XML** defines _what_ your system is: entities, their relationships, state shapes, tool signatures
- **TypeScript** defines _how_ it works: tool handler implementations

```xml
<!-- What exists -->
<entity name="Memory" type="base">
  <state>
    <fieldGroup name="entries" key="id">
      <field name="text" type="string" />
    </fieldGroup>
  </state>
  <tools>
    <autotool name="store" on="entries" op="create" peerVisible="true" />
  </tools>
</entity>
```

```typescript
// How it behaves (only when custom logic is needed)
export default async (entity, input) => {
  // custom handler -- autotools need zero code
};
```

The XML is the single source of truth. The compiler reads it and generates typed TypeScript: Zod schemas, proxy types, handler interfaces, the entity tree. You get full type safety without writing type annotations.

---

## Why This Approach

### vs. LangGraph

LangGraph gives you a graph of function nodes connected by edges. You write Python functions, wire them with conditional edges, and manage state manually.

InteractKit gives you a declarative entity graph where state is reactive, tool visibility is automatic, and LLM invocation is built-in. You define the tree in XML; the framework handles routing, state persistence, and tool binding.

### vs. CrewAI

CrewAI gives you agents with roles and tasks. You configure them in Python and they execute sequentially or hierarchically.

InteractKit gives you composable entities that can be anything -- not just "agents with roles." An entity can be a memory store, a sensor, a browser, an LLM brain, or a coordinator. The entity tree IS the architecture. Adding a capability means adding a node to the tree.

### vs. Building from Scratch

You could wire LangChain, Express, and a database together yourself. But then you're writing:
- Tool schema generation
- Tool binding to LLMs
- State persistence and reactive updates
- Entity-to-entity communication
- HTTP API routing
- Type generation
- Testing infrastructure

InteractKit does all of this from your XML definition.

---

## What You Get

| Feature | How |
|---------|-----|
| Type-safe entity graph | Generated from XML -- zero manual types |
| Auto HTTP API | `app.serve()` exposes every tool as an endpoint |
| LLM tool binding | Refs with `peerVisible` tools are auto-bound |
| State persistence | Reactive proxy, auto-saves to database |
| CRUD for free | `<autotool>` on fieldGroups -- zero handler code |
| Multi-tenant | `app.instance('tenant-id')` -- isolated state |
| Distribution | `remote="http://..."` -- same code, different process |
| Testing | `createTestApp(graph)` -- in-memory, mockable |

---

## The Core Idea

Everything is an **entity** in a tree. Each entity does one thing. Entities compose into larger systems. The tree IS the architecture:

```
SupportTeam
  +-- TriageBrain (LLM)     routes to specialists
  +-- BillingAgent
  |   +-- BillingBrain (LLM) handles refunds
  |   +-- Stripe              Stripe API
  |   +-- Memory              conversation history
  +-- TechAgent
      +-- TechBrain (LLM)    debugs issues
      +-- Jira                creates tickets
```

Each brain sees exactly the tools it needs. No routing tables, no tool filtering, no glue code. Adding a department means adding a branch to the tree.

---

## Next Steps

Ready to build? Start with the [Getting Started](getting-started.md) guide.

Want to see the building blocks? Jump to [Entities](entities.md) or [LLM Entities](llm.md).
