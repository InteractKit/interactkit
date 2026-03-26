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
| `database` | Database adapter (children inherit it) |
| `pubsub` | Pub/sub adapter (children inherit it) |
| `logger` | Log adapter (children inherit it) |

---

## Describing an Entity (`@Describe()`)

Every entity should have a `@Describe()` method. It returns a string that tells sibling entities and LLMs what this entity is and what it can do right now. For `LLMEntity` subclasses, the descriptions from the entity and its refs are automatically composed into the LLM's system prompt.

```typescript
@Entity()
class Browser extends BaseEntity {
  @State({ description: 'Search history' })
  private history: string[] = [];

  @Describe()
  describe() {
    return `A web browser. Can search the web and return results.`;
  }

  @Tool({ description: 'Search the web' })
  async search(input: { query: string }): Promise<string[]> {
    this.history.push(input.query);
    return await doSearch(input.query);
  }
}
```

Because `@Describe()` is a method (not a static string), you can include dynamic state via template literals. The description updates as the entity's state changes:

```typescript
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

Use standard `class-validator` decorators:

```typescript
@State({ description: 'Username' })
@MinLength(3) @MaxLength(50)
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

---

## Components (`@Component`): Children

An entity can contain other entities as children:

```typescript
@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private memory!: Memory;
  @Component() private browser!: Browser;
}
```

Call child methods normally. InteractKit routes them through an event bus behind the scenes:

```typescript
const results = await this.browser.search({ query: 'restaurants' });
```

---

## Refs (`@Ref`): Sibling References

Sometimes a child needs to talk to a sibling. Use `@Ref()`:

```typescript
@Entity()
class Agent extends BaseEntity {
  @Component() private brain!: Brain;
  @Component() private memory!: Memory;
}

@Entity()
class Brain extends BaseEntity {
  @Ref() private memory!: Memory;  // points to sibling

  @Tool({ description: 'Remember something' })
  async remember(input: { text: string }) {
    await this.memory.store({ text: input.text });
  }
}
```

The build verifies the ref target exists as a sibling.

---

## Streams (`EntityStream`): Child-to-Parent Data

Streams let a child push data up to its parent in real time:

```typescript
@Entity()
class Sensor extends BaseEntity {
  private readings!: EntityStream<number>;

  @Hook(Tick.Runner({ intervalMs: 1000 }))
  async onTick(input: Tick.Input) {
    this.readings.emit(Math.random() * 100);
  }
}

@Entity()
class Monitor extends BaseEntity {
  @Component() private sensor!: Sensor;

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    this.sensor.readings.on('data', (value) => {
      console.log('Reading:', value);
    });
  }
}
```

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

## All Properties Must Be Private

The only public things on an entity are `@Tool` methods. State, components, refs, and streams are all `private`. This keeps entities cleanly separated. They only interact through tools.

---

## LLM Entities

If an entity needs an LLM brain, extend `LLMEntity` instead of `BaseEntity`. This gives you a built-in `invoke()` method, conversation context, and automatic visibility of all refs and tools to the LLM. See [LLM Entities](./llm.md) for full details.

---

## What's Next?

- [LLM Entities](./llm.md): give an entity an LLM brain
- [Hooks](./hooks.md): make entities react to timers, schedules, and events
- [Infrastructure](./infrastructure.md): database, pub/sub, and logging adapters
