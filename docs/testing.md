# Testing

InteractKit ships a test helper that boots your entity graph with an in-memory database. Works with Vitest, Jest, or any async test runner.

## `createTestApp`

```typescript
import { createTestApp } from '@interactkit/sdk/test';
import { graph } from '../interactkit/.generated/graph.js';

test('agent stores entries in memory', async () => {
  const app = await createTestApp(graph);

  await app.memory.store({ text: 'hello' });
  const entries = await app.memory.getAll();

  expect(entries).toHaveLength(1);
  expect(entries[0].text).toBe('hello');

  await app.stop();
});
```

`createTestApp` uses an in-memory database (Map-based). No Prisma, no files. Returns the same typed app as `graph.configure()`.

## Handler Overrides

Mock or override any handler in tests:

```typescript
const app = await createTestApp(graph, {
  handlers: {
    Agent: {
      ask: async (entity, input) => 'mocked answer',
    },
    Sensor: {
      read: async (entity) => 42,
    },
  },
});

const answer = await app.agent.ask({ question: 'anything' });
expect(answer).toBe('mocked answer');

const reading = await app.sensor.read();
expect(reading).toBe(42);

await app.stop();
```

Handlers passed to `createTestApp` override `src`-defined handlers. This lets you mock LLM entities, external services, or anything else.

## Pre-seeded State

Inject initial state for specific entities:

```typescript
const app = await createTestApp(graph, {
  state: {
    'agent.memory': { entries: [{ id: '1', text: 'existing' }] },
    'agent.sensor': { readingCount: 10 },
  },
});

const count = await app.memory.count();
expect(count).toBe(1);
```

State keys are entity paths (dot-separated).

## Testing LLM Entities

Override the LLM entity's tool handler to bypass the actual LLM call:

```typescript
const app = await createTestApp(graph, {
  handlers: {
    Brain: {
      think: async (entity, input) => `Thought about: ${input.query}`,
    },
  },
});

const result = await app.brain.think({ query: 'philosophy' });
expect(result).toContain('philosophy');
```

Or override `invoke` to control the LLM response:

```typescript
const app = await createTestApp(graph, {
  handlers: {
    Brain: {
      invoke: async (entity, input) => `LLM says: ${input.message}`,
    },
  },
});
```

## Testing Autotools

Autotools work out of the box in tests -- they operate on the in-memory state:

```typescript
const app = await createTestApp(graph);

// Create
const id = await app.noteStore.addNote({ title: 'Test', content: 'Hello', tags: ['test'] });

// Read
const note = await app.noteStore.getNote({ id });
expect(note.title).toBe('Test');

// Search
const results = await app.noteStore.searchNotes({ query: 'Hello' });
expect(results).toHaveLength(1);

// Delete
await app.noteStore.deleteNote({ id });
const all = await app.noteStore.listNotes();
expect(all).toHaveLength(0);

await app.stop();
```

## State Inspection

The returned app has a `db` property for direct state inspection:

```typescript
const app = await createTestApp(graph);
await app.memory.store({ text: 'hello' });

// Inspect raw state in the database
const rawState = app.db.store.get('agent.memory');
console.log(rawState); // { entries: [{ id: '...', text: 'hello', ... }] }
```

## Test Patterns

| Pattern | Approach |
|---------|----------|
| Integration test | `createTestApp(graph)` -- boot full tree, call tools, assert results |
| Mock external service | Override handler: `handlers: { Brain: { invoke: ... } }` |
| Pre-seed state | `state: { 'agent.memory': { entries: [...] } }` |
| Test autotools | No mocking needed -- they work on in-memory state |
| Inspect DB | `app.db.store.get('entity.path')` |

## Tips

- **Shutdown after each test.** Call `app.stop()` to clean up. Use `afterEach` if needed.
- **Start with integration tests.** Boot the full tree and call tools on root. This catches most bugs.
- **Mock LLM calls.** Real API calls are slow, flaky, and cost money. Override `invoke` or specific tools.
- **Assert via tools, not raw state.** Call `getAll()`, `count()`, `search()` rather than reading `app.db` directly.

---

## What's Next?

- [Codegen](codegen.md) -- what gets generated
- [Deployment](deployment.md) -- run in production
