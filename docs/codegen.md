# Codegen

The SDK includes a build-time code generator that reads your entity source files and produces a type registry with Zod schemas.

## Running codegen

```bash
npx interactkit-codegen --project ./tsconfig.json --outDir ./src/__generated__
```

Or add it to your `package.json`:

```json
{
  "scripts": {
    "codegen": "interactkit-codegen --project ./tsconfig.json"
  }
}
```

## CLI options

| Flag | Default | Description |
|------|---------|-------------|
| `--project`, `-p` | `./tsconfig.json` | Path to tsconfig |
| `--outDir`, `-o` | `./src/__generated__` | Output directory |
| `--help`, `-h` | | Show help |

## What it generates

The codegen produces `__generated__/type-registry.ts` containing:

### Registry

```typescript
export const Registry = {
  entities: {
    'person': {
      state: z.object({ name: z.string().max(50), score: z.number().min(0).max(100) }),
      persona: true,
      methods: {
        'person.greet': {
          input: z.object({ name: z.string() }),
          result: z.string(),
          fieldMeta: {},
        },
      },
      components: ['brain', 'phone'],
      streams: [],
      refs: [],
      hooks: [
        { method: 'onInit', type: 'InitInput', config: {} },
        { method: 'onTick', type: 'TickInput', config: { intervalMs: 5000 } },
      ],
    },
  },
} as const;
```

### ConfigurableFields

```typescript
export const ConfigurableFields = {
  'person': [
    { key: 'name', label: 'Name', group: 'General', type: 'string', validation: z.string().max(50) },
  ],
} as const;
```

### Utility types

```typescript
export type EntityType = 'person' | 'brain' | 'phone';
export type MethodName = 'person.greet' | 'brain.think';
```

## What it extracts

| Source | Output |
|--------|--------|
| `@Entity` metadata | type, persona flag |
| Primitive properties | State — Zod validators |
| Entity-typed properties | Components list |
| `EntityStream<T>` properties | Streams list |
| `EntityRef<T>` properties | Refs list (build-time validated) |
| `@Hook()` methods | Hook dispatch table with config from generic params |
| `@Configurable()` properties | UI schema |
| Public async methods | Event methods with input/result Zod schemas |
| class-validator decorators | Zod refinements (`.max()`, `.email()`, etc.) |
| `@Secret()` | fieldMeta `{ secret: true }` |
| `@LLMEntity`, `@LLMTool`, `@LLMExecutionTrigger`, `@LLMVisible` | LLM metadata (tools, triggers, visible state) |
| `@Entity({ pubsub, database })` | Infrastructure info for deployment planning |

## Deployment plan

`interactkit build` also generates `.interactkit/generated/deployment.json` — see [Deployment](./deployment.md).

## Build-time validation

The codegen validates at build time:

- `@Component` references unknown entity type → error
- `@Ref` target not reachable as sibling → error
- `@Hook()` method without typed parameter → error
- `@LLMEntity` missing `@Executor` or `@Context` → error
- `@LLMExecutionTrigger` without `@LLMTool` methods → error
- `@LLMTool` without description → error
- LLM decorators without `@LLMEntity` → error

## Registry singleton

The CLI generates a `_entry.ts` bootstrap that calls `setRegistry()` before your code runs. You don't need to import the registry manually — `boot()` picks it up automatically:

```typescript
import { boot } from '@interactkit/sdk';
const ctx = await boot(Agent);  // registry auto-resolved
```

## Build order

```bash
interactkit build   # codegen + tsc + deployment plan → .interactkit/
```
