# Testing

InteractKit ships a test package with three utilities. No special test runner — works with Jest, Vitest, or anything that runs async functions.

```bash
pnpm add -D @interactkit/test
```

## `bootTest` — integration tests

Same as `boot()` but with deterministic IDs and optional mock executors. Boots the full entity tree — call methods on root and everything flows through children like production.

```typescript
import { bootTest } from '@interactkit/test';
import { Agent } from '../src/entities/agent.js';

test('agent stores thoughts in memory', async () => {
  const ctx = await bootTest(Agent);

  await ctx.root.ask({ question: 'What is time?' });
  const memories = await ctx.root.reflect();

  expect(memories).toHaveLength(1);
  expect(memories[0]).toContain('time');

  await ctx.shutdown();
});

test('entity tree has correct structure', async () => {
  const ctx = await bootTest(Agent);

  expect(ctx.entities.size).toBe(5);
  const types = [...ctx.entities.values()].map(e => e.type).sort();
  expect(types).toEqual(['agent', 'brain', 'memory', 'mouth', 'sensor']);

  await ctx.shutdown();
});
```

IDs are deterministic (`0001`, `0002`, ...) so snapshots are stable.

## `mockLLM` — test LLM behavior without API calls

Scripts a sequence of LLM responses and tool calls. The LLM loop runs exactly as in production — it just gets pre-defined answers instead of calling an API.

```typescript
import { bootTest, mockLLM } from '@interactkit/test';
import { Agent } from '../src/entities/agent.js';

test('LLM calls think tool and returns response', async () => {
  const ctx = await bootTest(Agent, {
    executors: {
      brain: mockLLM([
        // Step 1: LLM decides to call the think tool
        { toolCalls: [{ name: 'think', args: { query: 'philosophy' } }] },
        // Step 2: after seeing the tool result, LLM gives final answer
        { response: 'I thought about philosophy. Fascinating stuff.' },
      ])
    }
  });

  const result = await ctx.root.invoke({ message: 'think about philosophy' });

  expect(result).toBe('I thought about philosophy. Fascinating stuff.');
  await ctx.shutdown();
});

test('LLM calls multiple tools in sequence', async () => {
  const ctx = await bootTest(Agent, {
    executors: {
      brain: mockLLM([
        { toolCalls: [{ name: 'think', args: { query: 'hello' } }] },
        { toolCalls: [{ name: 'mouth.speak', args: { message: 'hello world' } }] },
        { response: 'Done.' },
      ])
    }
  });

  await ctx.root.invoke({ message: 'think and speak' });

  const history = await ctx.root.getSpeechHistory();
  expect(history).toContain('hello world');

  await ctx.shutdown();
});
```

Each `invoke()` call steps through the script. If the loop calls `invoke()` more times than there are steps, it throws — so you know your test script is incomplete.

## `mockEntity` — unit test with mocked dependencies

Creates a spy proxy that records calls and returns configured values. Use when you want to test one entity without booting the whole tree.

```typescript
import { bootTest, mockEntity } from '@interactkit/test';
import { Brain } from '../src/entities/brain.js';
import type { Mouth } from '../src/entities/mouth.js';
import type { Memory } from '../src/entities/memory.js';

test('think stores result in memory', async () => {
  const memory = mockEntity<Memory>();
  memory.on('store').returns(undefined);
  memory.on('getAll').returns(['previous thought']);

  const mouth = mockEntity<Mouth>();
  mouth.on('speak').returns(undefined);

  // Boot Brain with mocked siblings
  // (Brain is a leaf entity here — refs are replaced with mocks)
  const ctx = await bootTest(Brain);
  // Swap refs with mocks
  const brain = ctx.root as any;
  brain.memory = memory;
  brain.mouth = mouth;

  await brain.think({ query: 'hello' });

  expect(memory.calls('store')).toHaveLength(1);
  expect(memory.calls('store')[0]).toEqual({ text: expect.stringContaining('hello') });
});
```

### `mockEntity` API

```typescript
const mock = mockEntity<Memory>();

// Configure return values
mock.on('search').returns(['result 1', 'result 2']);
mock.on('store').returns(undefined);

// Use a function for dynamic returns
mock.on('count').returns(() => mock.calls('store').length);

// After running test code:
mock.calls('store')    // [{ text: 'first' }, { text: 'second' }]
mock.calls('search')   // [{ query: 'hello' }]
mock.reset()           // clear all recorded calls
```

## Testing MCP Entities

Since MCP entities are generated as regular entities with `@Tool` methods, you mock them with `mockEntity` like anything else. No MCP server needed in tests.

```typescript
import { bootTest, mockLLM, mockEntity } from '@interactkit/test';
import { Agent } from '../src/entities/agent.js';
import type { Slack } from '../src/entities/slack.js';

test('brain escalates billing issues to Slack', async () => {
  const slack = mockEntity<Slack>();
  slack.on('sendMessage').returns('Message sent');
  slack.on('searchChannels').returns([{ id: 'C123', name: 'billing' }]);

  const ctx = await bootTest(Agent, {
    executors: {
      brain: mockLLM([
        { toolCalls: [{ name: 'slack_searchChannels', args: { query: 'billing' } }] },
        { toolCalls: [{ name: 'slack_sendMessage', args: { channel: 'C123', text: 'Billing issue reported' } }] },
        { response: 'I escalated this to the billing team.' },
      ])
    }
  });

  // Swap the generated Slack entity with mock
  (ctx.root as any).slack = slack;

  const result = await ctx.root.invoke({ message: 'I was double-charged' });

  expect(result).toContain('escalated');
  expect(slack.calls('sendMessage')).toHaveLength(1);
  expect(slack.calls('sendMessage')[0].channel).toBe('C123');

  await ctx.shutdown();
});
```

This works because `interactkit add --mcp-stdio` generates a real entity class with typed `@Tool` methods. The test mocks that entity the same way it mocks Memory or any other entity — no MCP protocol, no server process, no network.

## What to test

| Level | What to use | When |
|-------|-------------|------|
| **Integration** | `bootTest(Agent)` | Test the full entity tree end-to-end. Most tests should be this. |
| **LLM behavior** | `bootTest` + `mockLLM` | Test that the LLM calls the right tools in the right order. |
| **MCP entities** | `bootTest` + `mockEntity` | Mock generated MCP entities — no server needed. |
| **Unit** | `bootTest` + `mockEntity` | Test one entity's logic with mocked dependencies. |
| **Build validation** | `interactkit build` | Codegen catches structural errors (missing decorators, bad refs, etc.) |

## Tips

- **Start with integration tests.** `bootTest(Root)` boots the whole tree. Call methods on root, assert on results. This catches most bugs.
- **Use `mockLLM` for deterministic LLM tests.** Real API calls are slow, flaky, and cost money. Script the exact tool-call sequence you expect.
- **Mock sparingly.** Only use `mockEntity` when you genuinely need to isolate one entity. Integration tests through the tree are more realistic and catch more bugs.
- **Shutdown after each test.** Call `ctx.shutdown()` to clean up hook runners and bus subscriptions. Use `afterEach` if needed.
- **Snapshot entity state.** After running operations, check state via tool methods (`reflect()`, `getHistory()`, `count()`). Don't reach into private properties.
