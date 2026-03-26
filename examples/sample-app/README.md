# InteractKit Sample App

Demo app testing all InteractKit features with 21 passing tests.

## Entity tree

```
Agent (root)
  ├── Brain  (extends LLMEntity, @SystemPrompt, @Executor, @Ref → Mouth, @Ref → Memory)
  ├── Mouth  (@Stream transcript: EntityStream<string>)
  ├── Memory (@Configurable capacity, store/search/count)
  └── Sensor (@Stream readings: EntityStream<number>)
```

## Features tested

- Entity tree structure (5 entities, scoped IDs)
- Direct method calls on root
- Parent -> child calls via `@Component` proxy
- Sibling calls via `@Ref` (Brain -> Mouth, Brain -> Memory)
- `@Stream()` decorator with parent subscription via component proxy
- EntityStream reusable `emit()`
- `@Configurable` properties
- `@Secret` fields
- class-validator (`@Min`, `@Max`, `@MinLength`, `@MaxLength`)
- Multiple sequential calls with state accumulation
- Memory search across stored entries
- Error propagation from child entities
- `LLMEntity` base class with `invoke()` and `ChatAnthropic` (LangChain)
- LLM tool calling loop (tool call -> execute -> feed back -> response)
- Built-in `response` and `toolCall` streams on LLMEntity

## Run

```bash
# From monorepo root:
pnpm install
cd examples/sample-app
pnpm dev    # builds + runs
```

## Expected output

```
=== Results: 21 passed, 0 failed ===
```
