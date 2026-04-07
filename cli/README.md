# @interactkit/cli

CLI for InteractKit projects. Compiles XML entity graphs into fully typed TypeScript, then builds and runs your app.

## Install

```bash
npm install -D @interactkit/cli
```

Or globally:

```bash
npm install -g @interactkit/cli
```

## Commands

### `init`

Scaffold a new project:

```bash
interactkit init my-app
interactkit init my-app --llm    # include an LLM entity
```

Creates:

```
my-app/
  interactkit/
    entities.xml           # entity graph
    tools/hello.ts         # sample tool handler
  src/
    app.ts                 # boot + serve
  package.json
  tsconfig.json
```

### `compile`

Compile `entities.xml` into typed TypeScript:

```bash
interactkit compile
interactkit compile -o ./interactkit/.generated    # custom output dir
```

Reads all `.xml` files from `interactkit/` and generates:

| File | Contents |
|------|----------|
| `types.ts` | Entity state interfaces, input/output types, proxy types |
| `tree.ts` | Entity tree structure (the runtime's source of truth) |
| `registry.ts` | Zod validators, entity metadata |
| `graph.ts` | Typed `InteractKitRuntime` subclass with proxy getters |
| `handlers.ts` | Auto-imports all `src` tool handler files |

### `build`

Compile + type-check:

```bash
interactkit build
```

Runs `compile` then `npx tsc --noEmit` to verify everything type-checks.

### `dev`

Compile + run + watch:

```bash
interactkit dev
interactkit dev -e ./src/app.ts    # custom entry file
```

Watches `interactkit/` and `src/` for changes. On any change, recompiles and restarts the app.

### `start`

Run the app:

```bash
interactkit start
interactkit start -e ./src/app.ts    # custom entry file
```

Runs `npx tsx src/app.ts`.

## Command Reference

| Command | Options | Description |
|---------|---------|-------------|
| `init <name>` | `--llm` | Scaffold a new project |
| `compile` | `-o, --outDir` | Compile XML to typed TypeScript |
| `build` | `-o, --outDir` | Compile + type-check |
| `dev` | `-o, --outDir`, `-e, --entry` | Compile + run + watch |
| `start` | `-e, --entry` | Run the app |

## How Compilation Works

1. **Parse XML** -- reads `interactkit/entities.xml` into an intermediate representation
2. **Validate** -- checks component references, ref targets, LLM config
3. **Expand autotools** -- generates CRUD method metadata from `<autotool>` elements
4. **Infer refs** -- LLM entities auto-get refs to all peer components
5. **Fetch remote schemas** -- if any entity has `remote="http://..."`, fetches `/schema` at compile time
6. **Generate TypeScript** -- emits fully typed interfaces, tree, registry, graph class, and handler imports

### Generated Types

For each entity, the compiler generates:

```typescript
// State interface
interface AgentState { count: number; }

// Input types (per tool)
interface AgentAskInput { question: string; }

// Entity type (what tool handlers receive)
interface AgentEntity extends Entity {
  state: AgentState;
  components: { brain: BrainProxy; memory: MemoryProxy; };
}

// Proxy type (what app code uses)
interface AgentProxy {
  ask(input: AgentAskInput): Promise<string>;
  brain: BrainProxy;
  memory: MemoryProxy;
}
```

Tool handlers get full type safety:

```typescript
// interactkit/tools/ask.ts
import type { AgentEntity, AgentAskInput } from '../.generated/types.js';

export default async (entity: AgentEntity, input: AgentAskInput): Promise<string> => {
  entity.state.count++;
  return entity.components.brain.think({ query: input.question });
};
```

## Project Structure

The CLI expects this layout:

```
your-project/
  interactkit/
    entities.xml               # entity graph (required)
    tools/                     # tool handler files (referenced by src="tools/foo.ts")
    .generated/                # output (gitignored)
  src/
    app.ts                     # your app entry point
```
