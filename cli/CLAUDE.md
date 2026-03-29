# @interactkit/cli

CLI tool for InteractKit projects. Scaffolding, codegen, building, and running. Uses commander.js.

## Commands

| Command | What it does |
|---------|-------------|
| `interactkit init <name>` | Scaffold a new project (agent + brain + memory, config, tsconfig) |
| `interactkit add <name> [--llm] [--detached] [--attach Parent] [--mcp-stdio "cmd"]` | Generate entity file. Dots for nesting: `researcher.Browser` |
| `interactkit build --root=path:Export` | Codegen + validation + tsc + auto-boot entry |
| `interactkit dev --root=path:Export` | Build + run + watch (restarts on changes) |
| `interactkit start` | Run the built app |

## Architecture

```
src/
  index.ts              # commander.js entry point
  commands/
    init/               # scaffold new project
    add/                # generate entity from template (--llm, --detached, dot-path nesting, --attach, --mcp-stdio)
    build/              # codegen + tsc + deployment plan
    dev/                # build + run + watch (restarts on changes)
    start/              # node <entry>
  codegen/
    types.ts            # shared interfaces (EntityInfo, LLMInfo)
    parser/             # ts-morph extraction
      index.ts          # main orchestrator
      properties.ts     # classify properties (component/ref/stream/state)
      hooks.ts          # hook extraction (runner from decorator arg, input from param type)
      methods.ts        # public async method extraction
      llm.ts            # LLMEntity detection (extends LLMEntity), @Executor, @SystemPrompt
    emit/
      index.ts          # EntityInfo[] -> type-registry.ts
    validator/          # build-time validation
      index.ts          # refs, components, LLM, hooks, Remote<T> enforcement
    deploy/
      index.ts          # deployment plan generator (co-location, scaling)
    mutator/            # pre-compile source transforms
      index.ts          # strips Remote<T> -> T so design:type metadata stays correct
                        # replaces ! with = {} as any
                        # injects @__Path decorators
    utils/              # extractStringProp, extractIdentProp, extractPackageName
```

## Key design rules

- CLI is a **separate package** from the SDK to avoid bloating SDK with ts-morph
- SDK exports runtime types/decorators only -- CLI handles build tooling
- Codegen output goes to `.interactkit/generated/` (gitignored)
- Build output goes to `.interactkit/build/`
- `build` always runs codegen + validation before `tsc`
- **LLM entity detection:** codegen checks `extends LLMEntity` (not a `@LLMEntity()` decorator)
- **Entity type auto-derivation:** when `type` is not specified in `@Entity()`, it is derived from the class name (PascalCase to kebab-case)
- All refs/state are visible to the LLM by default (no `@LLMVisible` extraction)
- **`Remote<T>` enforcement:** validator checks that ALL `@Component`/`@Ref` properties use `Remote<T>`. Also checks that remote `@Hook` (non-inProcess) uses `Remote<Input>`.
- **Mutator stage:** after validation, mutator strips `Remote<T>` to `T` in staging before compile so `design:type` metadata stays correct. Also replaces `!` with `= {} as any` and injects `@__Path` decorators.
- **`--detached` flag:** generates entity with `@Entity({ detached: true })` (uses remote pubsub from config)
- **No database in codegen:** database is not part of `ParsedInfra` -- it is configured globally in `interactkit.config.ts`

## Dependencies

| Package | Role |
|---------|------|
| `@interactkit/sdk` | Entity metadata reading (decorator reflection helpers) |
| `ts-morph` | Static analysis of entity source files |
| `commander` | CLI argument parsing |

## Future commands

- `interactkit inspect` -- show entity tree, hooks, methods
- `interactkit deploy` -- generate Docker Compose / Kubernetes from deployment.json
