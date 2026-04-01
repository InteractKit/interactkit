# Entities

An entity is a class that does one thing. A Browser browses. A Memory stores things. A Mailer sends emails.

Each entity has:
- **Describe:** a method (`@Describe()`) that returns a string describing the entity's current state
- **State:** data that gets saved automatically
- **Tools:** methods that other entities (or an LLM) can call
- **Children:** other entities it contains
- **Hooks:** reactions to events, timers, or startup

## Defining an Entity

```typescript
import { Entity, BaseEntity, State, Tool } from '@interactkit/sdk';

@Entity()
class Browser extends BaseEntity {
  @State({ description: 'Search history' })
  private history: string[] = [];

  @Tool({ description: 'Search the web' })
  async search(input: { query: string }): Promise<string[]> {
    this.history.push(input.query);
    return await doSearch(input.query);
  }
}
```

Options you can pass to `@Entity()`:

| Option | What it does |
|--------|-------------|
| `description` | Human-readable description |
| `detached` | `true` to use remote pubsub from config (can run on a separate machine) |

---

## Describing an Entity (`@Describe()`)

Every entity should have a `@Describe()` method. It returns a string that tells sibling entities and LLMs what this entity is and what it can do right now. For `LLMEntity` subclasses, the descriptions from the entity and its refs are automatically composed into the LLM's system prompt.

```typescript
import { Entity, BaseEntity, State, Describe, Tool } from '@interactkit/sdk';

@Entity()
class Memory extends BaseEntity {
  @State({ description: 'Stored entries' })
  private entries: string[] = [];

  @Describe()
  describe() {
    return `A memory store with ${this.entries.length} entries.
Currently remembering: ${this.entries.slice(-3).join(', ') || 'nothing yet'}.`;
  }

  @Tool({ description: 'Store a new entry' })
  async store(input: { text: string }) {
    this.entries.push(input.text);
  }
}
```

This is one of InteractKit's key ideas: entities describe themselves, and LLMs receive a system prompt that reflects the **current** state of the world -- not a static string written at development time.

---

## State (`@State`)

Any property with `@State()` gets saved to the database automatically.

```typescript
@State({ description: 'Bot name' })
private name = 'Atlas';

@State({ description: 'Message count' })
private messageCount = 0;
```

### Editable in a UI (`@Configurable`)

```typescript
@State({ description: 'Bot name' })
@Configurable({ label: 'Bot Name', group: 'General' })
private name = 'Atlas';
```

### Secrets (`@Secret`)

Masked in UIs and logs:

```typescript
@State({ description: 'API key' })
@Secret()
private apiKey!: string;
```

### Validation

Use the `validate` option on `@State()` with a Zod schema (`z` is re-exported from the SDK):

```typescript
@State({ description: 'Username', validate: z.string().min(3).max(50) })
private username!: string;
```

---

## Tools (`@Tool`)

Tools are the entity's public API. Every public method needs `@Tool`:

```typescript
@Tool({ description: 'Send an email' })
async send(input: { to: string; body: string }): Promise<string> {
  return 'Sent!';
}
```

The description tells other entities (and LLMs) what the tool does. If you forget `@Tool` on a public method, the build fails.

On an `LLMEntity`, own `@Tool` methods are external-facing by default -- other entities can call them, but the LLM cannot see them during its thinking loop. To make a tool visible to the LLM, add `llmCallable: true`:

```typescript
@Tool({ description: 'Move in a direction', llmCallable: true })
async move(input: { direction: string }): Promise<string> { /* ... */ }
```

Tools on `@Ref` and `@Component` children are always visible to the LLM -- no `llmCallable` needed.

---

## Components (`@Component`): Children

An entity can contain other entities as children. All `@Component` and `@Ref` properties require `Remote<T>` -- the build enforces this:

```typescript
import { Entity, BaseEntity, Component, type Remote } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Remote<Brain>;
  @Component() private memory!: Remote<Memory>;
  @Component() private browser!: Remote<Browser>;
}
```

Call child methods like normal functions. InteractKit routes them through an event bus behind the scenes -- same process, different process, different machine. Same code either way:

```typescript
const results = await this.browser.search({ query: 'restaurants' });
```

---

## Refs (`@Ref`): Sibling References

Sometimes a child needs to talk to a sibling. Use `@Ref()`:

```typescript
import { Entity, BaseEntity, Component, Ref, Tool, type Remote } from '@interactkit/sdk';

@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Remote<Brain>;
  @Component() private memory!: Remote<Memory>;
}

@Entity()
class Brain extends BaseEntity {
  @Ref() private memory!: Remote<Memory>;  // points to sibling

  @Tool({ description: 'Remember something' })
  async remember(input: { text: string }) {
    await this.memory.store({ text: input.text });
  }
}
```

The build verifies the ref target exists as a sibling.

Refs are also how multiple `LLMEntity` instances share a single conversation history via `ConversationContext`. See [Shared Conversation Context](./llm.md#shared-conversation-context).

---

## Streams (`EntityStream`): Child-to-Parent Data

Streams let a child push data up to its parent in real time. They work both in-process and across Redis:

```typescript
import { Entity, BaseEntity, Component, Stream, Hook, Init, Tick, type Remote } from '@interactkit/sdk';
import type { EntityStream } from '@interactkit/sdk';

@Entity({ detached: true })
class Sensor extends BaseEntity {
  @Stream() readings!: EntityStream<number>;

  @Hook(Tick.Runner({ intervalMs: 1000 }))
  async onTick(input: Remote<Tick.Input>) {
    this.readings.emit(Math.random() * 100);
  }
}

@Entity()
class Monitor extends BaseEntity {
  @Component() private sensor!: Remote<Sensor>;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    this.sensor.readings.on('data', (value: unknown) => {
      console.log('Reading:', value);
    });
  }
}
```

When child and parent share a process, streams are direct in-memory calls. When the child is `detached`, streams automatically publish via the remote pubsub from config, and the parent subscribes. No code changes needed.

---

## Distributed Entities

Add `detached: true` to an entity and it can run on a different machine (using the remote pubsub from `interactkit.config.ts`). `Remote<T>` is required on all `@Component` and `@Ref` properties -- the build enforces this. Every method call, property access, and return value becomes type-safe async:

```typescript
import { Entity, BaseEntity, Component, Tool, Hook, Init, type Remote } from '@interactkit/sdk';

@Entity({ detached: true })
class Worker extends BaseEntity {
  @Tool({ description: 'Get a callback function' })
  async getProcessor() {
    return (data: string) => data.toUpperCase();  // returns a function
  }
}

@Entity()
class Agent extends BaseEntity {
  @Component() private worker!: Remote<Worker>;

  @Hook(Init.Runner())
  async onInit() {
    // Method call across machines -- type-safe
    const fn = await this.worker.getProcessor();

    // The returned function is a live proxy -- call it across machines
    const result = await fn('hello');  // "HELLO"
  }
}
```

Everything works as you'd expect:
- Call methods: `await this.worker.process({ data: 'hello' })`
- Read properties: `const name = await this.worker.name`
- Return functions: a function returned from a remote call is still callable
- Return objects: class instances returned from remote calls keep their methods

Run 5 replicas, tasks distribute automatically, state syncs via the remote pubsub. No code changes.

---

## Entity IDs

Every entity gets an auto-generated ID scoped to its parent:

```
agent:a1b2c3
agent:a1b2c3/brain:d4e5f6
agent:a1b2c3/memory:g7h8i9
```

Access it with `this.id`. You never set IDs manually.

---

## Visibility Rules

- **Public:** `@Tool` methods and `@Stream` properties (parents subscribe to child streams)
- **Private:** State, components, and refs

Entities interact through tools. Parents access child streams through the component proxy (`this.child.streamName.on('data', ...)`).

## Entity Type

When you omit `type` from `@Entity()` (recommended), it's auto-derived from the class name: `PascalCase` to `kebab-case`. For example, `ResearchBrain` becomes `research-brain`.

## No Custom Constructors

`BaseEntity` has a `protected` constructor. You cannot define your own -- the build enforces this. Use `@Hook(Init.Runner())` for initialization logic.

---

## LLM Entities

If an entity needs an LLM brain, extend `LLMEntity` instead of `BaseEntity`. Every `LLMEntity` runs a **thinking loop** -- a continuous inner monologue where the LLM thinks, uses tools, and responds to tasks. `invoke()` pushes tasks to the loop; the LLM uses `respond()` to return results. Between tasks, the LLM can think autonomously, manage memory, or sleep.

Key points:
- Own `@Tool` methods are external-only by default. Use `llmCallable: true` to expose to the LLM.
- `@Ref` and `@Component` tools are always LLM-visible -- so capabilities (memory, browser) should be components.
- Use `@ThinkingLoop(options)` to configure interval, timeouts, and get a runtime handle.
- Set `alwaysThink: true` for autonomous agents that think even without tasks.

Full details in [LLM Entities](./llm.md).

---

## What's Next?

- [LLM Entities](./llm.md): give an entity an LLM brain
- [Hooks](./hooks.md): make entities react to timers, schedules, and events
- [Infrastructure](./infrastructure.md): database, pub/sub, and observer adapters
