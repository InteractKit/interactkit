# LLM Entities

Add AI capabilities to any entity with LLM decorators. Uses LangChain's `BaseChatModel` interface — drop in any model (OpenAI, Anthropic, Gemini, etc.).

## Basic setup

```typescript
import { Entity, BaseEntity, LLMEntity, Context, Executor, LLMTool, LLMExecutionTrigger, LLMVisible, LLMContext } from '@interactkit/sdk';
import type { LLMExecutionTriggerParams } from '@interactkit/sdk';
import { ChatOpenAI } from '@langchain/openai';

@LLMEntity()
@Entity({ type: 'assistant' })
class Assistant extends BaseEntity {
  @Context() context = new LLMContext();
  @Executor() llm = new ChatOpenAI({ model: 'gpt-4' });

  @LLMVisible()
  mood = 'helpful';

  @LLMTool({ description: 'Search the knowledge base' })
  async search(input: { query: string }): Promise<string> {
    return `Results for: ${input.query}`;
  }

  @LLMExecutionTrigger()
  async chat(params: LLMExecutionTriggerParams): Promise<string> { return ''; }
}
```

## Decorators

### @LLMEntity()

Marks a class as LLM-powered. Must be used alongside `@Entity`. Requires `@Executor` and `@Context` properties.

### @Executor()

Marks a property as the LLM instance. Must be a LangChain `BaseChatModel` — any model that supports `bindTools()` and `invoke()`:

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

@Executor() llm = new ChatOpenAI({ model: 'gpt-4' });
@Executor() llm = new ChatAnthropic({ model: 'claude-3-5-sonnet-20241022' });
@Executor() llm = new ChatGoogleGenerativeAI({ model: 'gemini-pro' });
```

### @Context()

Marks a property as the conversation context. Must be a `LLMContext` instance:

```typescript
@Context() context = new LLMContext();
```

`LLMContext` manages conversation history:

```typescript
context.addUser('Hello');
context.addAssistant('Hi there!');
context.addToolResult('call_123', 'Tool output');
context.getMessages();   // full message array for LLM
context.getHistory();    // history without system prompt
context.clear();         // reset conversation
```

### @LLMTool({ description })

Exposes a method as a tool the LLM can call. The method's parameters become the tool's input:

```typescript
@LLMTool({ description: 'Send an email to someone' })
async sendEmail(input: { to: string; subject: string; body: string }): Promise<string> {
  // Actually send the email
  return 'Email sent';
}
```

The `description` is what the LLM sees to decide when to use the tool. Make it clear and specific.

### @LLMExecutionTrigger()

Replaces the method body with the LLM execution loop. When called:

1. Appends `params.message` to `@Context`
2. Calls `@Executor` with `@LLMTool` methods as available tools (via LangChain `bindTools`)
3. If LLM returns tool calls → executes them → feeds results back
4. Loops until LLM produces a final text response
5. Returns the response

```typescript
@LLMExecutionTrigger()
async chat(params: LLMExecutionTriggerParams): Promise<string> { return ''; }
```

The method body is never executed — leave it empty.

**`LLMExecutionTriggerParams`:**

```typescript
interface LLMExecutionTriggerParams {
  message: string;
  caller: { entityId: string; entityType: string };
  lineage: Array<{ entityId: string; entityType: string }>;
  relationship: 'parent' | 'child' | 'sibling' | 'self' | 'external';
  metadata?: Record<string, unknown>;
}
```

The runtime auto-populates `caller`, `lineage`, and `relationship` from the event bus source.

### @LLMVisible()

Exposes a state property to the LLM as part of its context. Hidden by default — opt in explicitly:

```typescript
@LLMVisible() personality = 'curious';    // LLM sees this
@LLMVisible() currentTask = 'researching'; // LLM sees this
secretKey = 'abc123';                       // LLM does NOT see this
```

## LangChain compatibility

The `@LLMExecutionTrigger` execution loop uses LangChain's native API:

```
model.bindTools(tools).invoke(messages) → AIMessage
  └─ AIMessage.tool_calls → execute tools → ToolMessage → loop
  └─ AIMessage.content → final response
```

Any model implementing `bindTools()` and returning `AIMessage` with `tool_calls` works.

## Build-time validation

The codegen catches at build time:

- `@LLMEntity` without `@Executor` or `@Context`
- `@LLMExecutionTrigger` without `@LLMTool` methods
- `@LLMTool` without a description
- `@LLMTool` on non-public/non-async methods
- `@LLMVisible` on non-state properties
- LLM decorators without `@LLMEntity`

## Example: Agent with sibling tools

```typescript
@LLMEntity()
@Entity({ type: 'brain' })
class Brain extends BaseEntity {
  @Context() context = new LLMContext();
  @Executor() llm = new ChatOpenAI({ model: 'gpt-4' });

  @Ref() memory!: Memory;   // sibling
  @Ref() mouth!: Mouth;     // sibling

  @LLMVisible() personality = 'curious';

  @LLMTool({ description: 'Store something in long-term memory' })
  async remember(input: { text: string }) {
    await this.memory.store(input);
    return 'Stored';
  }

  @LLMTool({ description: 'Search memory for relevant info' })
  async recall(input: { query: string }) {
    return this.memory.search(input);
  }

  @LLMTool({ description: 'Speak a message aloud' })
  async speak(input: { message: string }) {
    await this.mouth.speak(input);
    return 'Spoken';
  }

  @LLMExecutionTrigger()
  async chat(params: LLMExecutionTriggerParams): Promise<string> { return ''; }
}
```

The LLM can call `remember`, `recall`, and `speak` — which transparently route through the event bus to sibling entities.
