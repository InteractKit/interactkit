# @interactkit/cli

CLI tool for InteractKit projects. Handles codegen, building, and running.

## Install

```bash
pnpm add -D @interactkit/cli
```

## Commands

```bash
interactkit build    # codegen + tsc → .interactkit/build/ + deployment.json
interactkit dev      # build + watch mode
interactkit start    # run the built app
```

## What `build` does

1. **Codegen** — scans entity source files via ts-morph, generates `.interactkit/generated/type-registry.ts`
2. **Validation** — checks entity refs, LLM config, hook params at build time
3. **Deployment plan** — generates `.interactkit/generated/deployment.json` (co-location analysis)
4. **Bootstrap** — generates `_entry.ts` that sets the registry singleton
5. **Compile** — runs `tsc` → `.interactkit/build/`

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--project`, `-p` | `./tsconfig.json` | Path to tsconfig |
| `--outDir`, `-o` | `./.interactkit/generated` | Codegen output directory |

## Build-time validation

The codegen catches:
- Unknown component entity types
- `@Ref` targets not reachable as siblings
- `@Hook` methods without typed parameters
- `@LLMEntity` missing `@Executor` or `@Context`
- `@LLMExecutionTrigger` without tools
- Orphaned LLM decorators without `@LLMEntity`
