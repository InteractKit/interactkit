# InteractKit Sample App

Demo app testing all InteractKit features with 21 passing tests.

## Entity tree

```
Agent (root, @LLMEntity)
  ├── Brain  (@LLMEntity, @Ref → Mouth, @Ref → Memory)
  ├── Mouth  (EntityStream<string> for transcripts)
  ├── Memory (@Configurable capacity, store/search/count)
  └── Sensor (EntityStream<number> for readings)
```

## Features tested

- Entity tree structure (5 entities, scoped IDs)
- Direct method calls on root
- Parent → child calls via `@Component` proxy
- Sibling calls via `@Ref` (Brain → Mouth, Brain → Memory)
- EntityStream reusable `emit()`
- `@Configurable` properties
- `@Secret` fields
- class-validator (`@Min`, `@Max`, `@MinLength`, `@MaxLength`)
- Multiple sequential calls with state accumulation
- Memory search across stored entries
- Error propagation from child entities
- `@LLMExecutionTrigger` with MockLLM
- LLM tool calling loop (tool call → execute → feed back → response)

## Run

```bash
# From monorepo root:
pnpm install
pnpm --filter @interactkit/sdk build
pnpm --filter @interactkit/cli build
cd examples/sample-app
pnpm build
pnpm start
```

## Expected output

```
=== Results: 21 passed, 0 failed ===
```
