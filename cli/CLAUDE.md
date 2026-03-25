# @interactkit/cli

CLI tool for InteractKit projects. Handles codegen, building, and running.

## Commands

| Command | What it does |
|---------|-------------|
| `interactkit build` | Run codegen (ts-morph → type registry) + `tsc` |
| `interactkit dev` | Build + watch mode |
| `interactkit start` | Run the compiled app (`node dist/index.js`) |

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--project`, `-p` | `./tsconfig.json` | Path to tsconfig |
| `--outDir`, `-o` | `./.interactkit/generated` | Codegen output directory |
| `--entry`, `-e` | `./dist/index.js` | Entry point for `start` |

## Architecture

```
src/
  index.ts              # CLI entry point — parses command + flags, dispatches
  commands/
    build.ts            # codegen + tsc
    dev.ts              # build + tsc --watch
    start.ts            # node <entry>
  codegen/
    extract.ts          # ts-morph orchestrator — walks @Entity classes
    emitter.ts          # EntityInfo[] → type-registry.ts
    type-mapper.ts      # TS Type → Zod code string
    validator-mapper.ts # class-validator AST → Zod refinements
```

## Key design rules

- CLI is a **separate package** from the SDK to avoid bloating SDK with ts-morph
- SDK exports runtime types/decorators only — CLI handles build tooling
- Codegen output goes to `.interactkit/generated/` (gitignored)
- `build` always runs codegen before `tsc`

## Dependencies

| Package | Role |
|---------|------|
| `@interactkit/sdk` | Entity metadata reading (decorator reflection helpers) |
| `ts-morph` | Static analysis of entity source files |

## Future commands

- `interactkit init` — scaffold a new project
- `interactkit add <entity>` — generate entity boilerplate
- `interactkit inspect` — show entity tree, hooks, methods
