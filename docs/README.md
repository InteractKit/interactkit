# InteractKit

**Build composable, multi-agent AI systems in TypeScript.**

Define your entity graph in XML. Write tool handlers in TypeScript. The CLI compiles everything into a fully typed runtime with auto-generated HTTP APIs, WebSocket streams, and type-safe proxies.

```bash
npm i -g @interactkit/cli
interactkit init my-app
cd my-app && pnpm install
interactkit dev
```

---

## How It Works

You define entities and their relationships in `interactkit/entities.xml`:

```xml
<graph xmlns="https://interactkit.dev/schema/v1" version="1" root="Agent">
  <entity name="Agent" type="base" description="Root agent">
    <components>
      <component name="brain" entity="Brain" />
      <component name="memory" entity="Memory" />
    </components>
    <tools>
      <tool name="ask" description="Ask a question" src="tools/ask.ts">
        <input><param name="question" type="string" /></input>
        <output type="string" />
      </tool>
    </tools>
  </entity>

  <entity name="Brain" type="llm" description="LLM brain">
    <describe>You are a helpful assistant.</describe>
    <executor provider="openai" model="gpt-4o-mini" />
  </entity>

  <entity name="Memory" type="base" description="Key-value store">
    <state>
      <fieldGroup name="entries" key="id">
        <field name="text" type="string" description="Entry content" />
      </fieldGroup>
    </state>
    <tools>
      <autotool name="store" on="entries" op="create" peerVisible="true" />
      <autotool name="search" on="entries" op="search" key="query" peerVisible="true" />
    </tools>
  </entity>
</graph>
```

Write handler logic in TypeScript files referenced via `src`:

```typescript
// interactkit/tools/ask.ts
import type { AgentEntity, AgentAskInput } from '../.generated/types.js';

export default async (entity: AgentEntity, input: AgentAskInput): Promise<string> => {
  return entity.components.brain.invoke({ message: input.question });
};
```

Configure and boot in `src/app.ts`:

```typescript
import { graph } from '../interactkit/.generated/graph.js';
import { DevObserver } from '@interactkit/sdk';

const app = graph.configure({
  observers: [new DevObserver()],
});

await app.boot();
const answer = await app.agent.ask({ question: 'Hello!' });
```

---

## Next Steps

| I want to...                | Start here |
|-----------------------------|-----------|
| Build my first app          | [Getting Started](getting-started.md) |
| Understand the philosophy   | [Why InteractKit](why.md) |
| Define entities in XML      | [Entities](entities.md) |
| Add LLM-powered agents     | [LLM Entities](llm.md) |
| Expose an HTTP API          | [Deployment](deployment.md) |
| Test my app                 | [Testing](testing.md) |

| Reference              | What's inside |
|-------------------------|--------------|
| [Codegen](codegen.md)   | What the compiler generates |
| [Infrastructure](infrastructure.md) | Database, observers, adapters |
| [Extensions](extensions.md) | Prisma, ChromaDB, Pinecone, etc. |
| [Hooks](hooks.md)       | Init handlers |
