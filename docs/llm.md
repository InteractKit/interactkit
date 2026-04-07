# LLM Entities

An LLM entity is an entity with a brain. Set `type="llm"` and add an `<executor>` to give it an LLM that can reason and call tools.

## Defining an LLM Entity

```xml
<entity name="Brain" type="llm" description="LLM-powered reasoning">
  <describe>You are a {{personality}} assistant. Memory has {{entries.length}} entries.</describe>
  <executor provider="openai" model="gpt-4o-mini" />
  <state>
    <field name="personality" type="string" description="Personality" default="helpful" />
  </state>
  <refs>
    <ref name="memory" entity="Memory" />
    <ref name="browser" entity="Browser" />
  </refs>
  <tools>
    <tool name="summarize" description="Summarize text" llm-callable="true">
      <input><param name="text" type="string" /></input>
      <output type="string" />
    </tool>
  </tools>
</entity>
```

Every LLM entity gets an `invoke()` method automatically. Call it to send a message to the LLM:

```typescript
const result = await entity.components.brain.invoke({ message: 'Research TypeScript' });
```

---

## Executor Configuration

The `<executor>` element specifies the LLM provider and model:

```xml
<executor provider="openai" model="gpt-4o-mini" />
<executor provider="anthropic" model="claude-sonnet-4-20250514" />
<executor provider="google" model="gemini-pro" />
<executor provider="ollama" model="llama3" />
```

| Provider | Package Required |
|----------|-----------------|
| `openai` | `@langchain/openai` |
| `anthropic` | `@langchain/anthropic` |
| `google` | `@langchain/google-genai` |
| `ollama` | `@langchain/ollama` |

The executor is auto-created at boot time. Install the LangChain package for your provider and set the appropriate API key environment variable (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

---

## Tool Visibility

LLM entities can see tools from three sources:

| Source | Visibility Rule |
|--------|----------------|
| Ref tools | Tools with `peerVisible="true"` are visible to the LLM |
| Component tools | Tools with `peerVisible="true"` are visible to the LLM |
| Own tools | Only visible if `llm-callable="true"` |

Tools from refs are prefixed with the ref name: `memory_store`, `browser_search`. This prevents name collisions and tells the LLM which entity the tool belongs to.

### peerVisible

Mark a tool as `peerVisible="true"` to make it visible to sibling LLM entities:

```xml
<!-- On Memory entity -->
<tool name="store" description="Store an entry" peerVisible="true" src="tools/store.ts">
  <input><param name="text" type="string" /></input>
  <output type="void" />
</tool>
```

When Brain has `<ref name="memory" entity="Memory" />`, the LLM sees `memory_store` as an available tool.

### llm-callable

Own tools on an LLM entity are external-facing by default (other entities call them). To make a tool usable by the LLM itself during reasoning:

```xml
<tool name="move" description="Move in a direction" llm-callable="true">
  <input><param name="direction" type="string" /></input>
  <output type="string" />
</tool>
```

---

## System Prompt

The `<describe>` template on an LLM entity becomes its system prompt. It supports `{{field}}` interpolation with current state values:

```xml
<describe>You are a {{personality}} assistant. You have access to {{entries.length}} memories.</describe>
```

The system prompt is auto-composed: the LLM entity's own describe comes first, followed by each ref's describe output. This gives the LLM a live snapshot of every entity it can interact with:

```
You are a curious assistant.

[memory] Memory -- 47 entries (capacity: 100)
[browser] Web browser. Cache has 12 pages.
```

---

## LLM Context

Each LLM entity maintains a conversation context (sliding window of messages). Context persists across `invoke()` calls within the same entity instance.

The LLM invocation loop:
1. `invoke({ message })` is called
2. System prompt is built from describe templates
3. Message is added to context
4. LLM is called with tools bound
5. If LLM returns tool calls, they are executed and results fed back
6. Loop repeats until LLM returns a text response

---

## Invoke from Handlers

In a parent entity's handler:

```typescript
// interactkit/tools/ask.ts
import type { AgentEntity, AgentAskInput } from '../.generated/types.js';

export default async (entity: AgentEntity, input: AgentAskInput): Promise<string> => {
  return entity.components.brain.invoke({ message: input.question });
};
```

---

## Full Example

```xml
<graph xmlns="https://interactkit.dev/schema/v1" version="1" root="Agent">

  <entity name="Agent" type="base" description="Chat agent">
    <components>
      <component name="brain" entity="Brain" />
      <component name="memory" entity="Memory" />
    </components>
    <tools>
      <tool name="chat" description="Chat with the agent" src="tools/chat.ts">
        <input><param name="message" type="string" /></input>
        <output type="string" />
      </tool>
    </tools>
  </entity>

  <entity name="Brain" type="llm" description="LLM brain">
    <describe>You are a helpful assistant with access to a memory store.</describe>
    <executor provider="anthropic" model="claude-sonnet-4-20250514" />
    <refs>
      <ref name="memory" entity="Memory" />
    </refs>
  </entity>

  <entity name="Memory" type="base" description="Persistent memory">
    <describe>Memory -- {{entries.length}} entries</describe>
    <state>
      <fieldGroup name="entries" key="id">
        <field name="text" type="string" description="Entry content" />
      </fieldGroup>
    </state>
    <tools>
      <autotool name="store" on="entries" op="create" peerVisible="true" />
      <autotool name="search" on="entries" op="search" key="query" peerVisible="true" />
      <autotool name="getAll" on="entries" op="list" peerVisible="true" />
    </tools>
  </entity>

</graph>
```

```typescript
// interactkit/tools/chat.ts
import type { AgentEntity, AgentChatInput } from '../.generated/types.js';

export default async (entity: AgentEntity, input: AgentChatInput): Promise<string> => {
  return entity.components.brain.invoke({ message: input.message });
};
```

```typescript
// src/app.ts
import { graph } from '../interactkit/.generated/graph.js';
import { DevObserver } from '@interactkit/sdk';

const app = graph.configure({ observers: [new DevObserver()] });
await app.boot();

const answer = await app.agent.chat({ message: 'Remember that I like coffee' });
// Brain calls memory_store automatically, then responds
```

---

## Router Pattern (Multiple Brains)

Use separate brain entities for separate concerns. The parent routes:

```xml
<entity name="Support" type="base" description="Support router">
  <components>
    <component name="triage" entity="TriageBrain" />
    <component name="billing" entity="BillingBrain" />
    <component name="technical" entity="TechBrain" />
  </components>
  <state>
    <field name="department" type="string" description="Active department" default="triage" />
  </state>
  <tools>
    <tool name="chat" description="Send message" src="tools/support-chat.ts">
      <input><param name="message" type="string" /></input>
      <output type="string" />
    </tool>
  </tools>
</entity>
```

```typescript
// interactkit/tools/support-chat.ts
export default async (entity, input) => {
  const brain = entity.components[entity.state.department];
  return brain.invoke({ message: input.message });
};
```

---

## What's Next?

- [Entities](entities.md) -- state, fieldGroups, autotools, streams
- [Testing](testing.md) -- mock LLM responses in tests
- [Deployment](deployment.md) -- expose as HTTP API
