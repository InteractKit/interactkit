# @interactkit/cli

CLI tool for InteractKit projects. Scaffolding, codegen, building, and running. Uses commander.js.

## Commands

| Command | What it does |
|---------|-------------|
| `interactkit init <name>` | Scaffold a new project (agent + brain + memory, config, tsconfig) |
| `interactkit add <name> [--llm] [--attach Parent]` | Generate entity file. Dots for nesting: `researcher.Browser` |
| `interactkit build --root=path:Export` | Codegen + validation + tsc + auto-boot entry |
| `interactkit dev --root=path:Export` | Build + run + watch (restarts on changes) |
| `interactkit start` | Run the built app |

## Architecture

```
src/
  index.ts              # commander.js entry point
  commands/
    init.ts             # scaffold new project
    add.ts              # generate entity from template (--llm flag, dot-path nesting, --attach)
    build.ts            # codegen + tsc + deployment plan
    dev.ts              # build + run + watch (restarts on changes)
    start.ts            # node <entry>
  codegen/
    types.ts            # shared interfaces (EntityInfo, LLMInfo — no visibleState)
    utils.ts            # extractStringProp, extractIdentProp, extractPackageName
    extract/
      index.ts          # main orchestrator
      properties.ts     # classify properties (component/ref/stream/state)
      hooks.ts          # hook extraction (runner from decorator arg, input from param type)
      methods.ts        # public async method extraction
      llm.ts            # LLMEntity detection (extends LLMEntity), @Executor, @LLMTool, @SystemPrompt
    emit/
      index.ts          # EntityInfo[] → type-registry.ts
    validate/
      index.ts          # build-time validation (refs, components, LLM, hooks)
    deploy/
      index.ts          # deployment plan generator (co-location, scaling)
    mappers/
      type-mapper.ts    # TS Type → Zod code string
      validator-mapper.ts # @Secret() extraction + field metadata
```

## Key design rules

- CLI is a **separate package** from the SDK to avoid bloating SDK with ts-morph
- SDK exports runtime types/decorators only — CLI handles build tooling
- Codegen output goes to `.interactkit/generated/` (gitignored)
- Build output goes to `.interactkit/build/`
- `build` always runs codegen + validation before `tsc`
- **LLM entity detection:** codegen checks `extends LLMEntity` (not a `@LLMEntity()` decorator)
- **Entity type auto-derivation:** when `type` is not specified in `@Entity()`, it is derived from the class name (PascalCase → snake_case)
- **`@LLMVisible` extraction removed** from llm.ts — all refs/state are visible to the LLM by default
- **`visibleState` removed** from `LLMInfo` type
- **Validation changes:** `@Context()` is no longer required (built into `LLMEntity`); `@LLMExecutionTrigger` validation removed (replaced by built-in `invoke()`)

## Dependencies

| Package | Role |
|---------|------|
| `@interactkit/sdk` | Entity metadata reading (decorator reflection helpers) |
| `ts-morph` | Static analysis of entity source files |
| `commander` | CLI argument parsing |

## Future commands

- `interactkit inspect` — show entity tree, hooks, methods
- `interactkit deploy` — generate Docker Compose / Kubernetes from deployment.json
