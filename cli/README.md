# @interactkit/cli

CLI tool for InteractKit projects. Scaffolding, codegen, building, and running.

## Install

```bash
pnpm add -D @interactkit/cli
```

## Commands

```
interactkit init <name>                         Create a new project
interactkit add <entity|llm|component> <Name>   Generate an entity file
interactkit build [-p tsconfig] [-o outDir]     Codegen + tsc + deployment plan
interactkit dev [-p tsconfig] [-o outDir]       Build + run + watch (restarts on changes)
interactkit start [-e entry]                    Run the built app
```

## `init`

Scaffolds a new InteractKit project with package.json, tsconfig, config, root entity, and entry point:

```bash
interactkit init my-agent
cd my-agent && pnpm install && pnpm build && pnpm start
```

## `add`

Generates entity files from templates:

```bash
interactkit add entity Brain         # basic entity with @Hook onInit
interactkit add llm Assistant        # extends LLMEntity with @SystemPrompt, @Executor, @Tool
interactkit add component Memory     # entity with @Configurable + process method
```

## `build`

1. **Codegen** — scans entity source files via ts-morph, generates `.interactkit/generated/type-registry.ts`
2. **Validation** — checks entity refs, LLM config, hook params at build time
3. **Deployment plan** — generates `.interactkit/generated/deployment.json`
4. **Bootstrap** — generates `_entry.ts` that sets the registry singleton
5. **Compile** — runs `tsc` → `.interactkit/build/`

## `dev`

Runs `build`, starts the app, and watches for changes. Automatically rebuilds and restarts on file changes.

## `start`

Runs the built app from `.interactkit/build/src/_entry.js`.

## Build-time validation

The codegen catches:
- Unknown component entity types
- `@Ref` targets not reachable as siblings
- `@Hook` methods without typed parameters
- `LLMEntity` subclass missing `@Executor`
- Orphaned LLM decorators without `extends LLMEntity`
