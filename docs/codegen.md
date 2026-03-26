# Codegen

`interactkit build` reads your entity classes and generates a type registry with Zod schemas, validation, and a deployment plan.

## Running It

```bash
interactkit build --root=src/entities/agent:Agent
```

This does: codegen, TypeScript compile, boot setup. Outputs to `.interactkit/`

| Flag | Default | What it does |
|------|---------|-------------|
| `--root` | (required) | Entry point, `path:ExportName` |
| `--project`, `-p` | `./tsconfig.json` | Path to tsconfig |
| `--outDir`, `-o` | `./.interactkit/generated` | Output directory |

## What Gets Generated

Everything goes into `.interactkit/generated/type-registry.ts`:

### Entity Registry

A map of all entities, their state schemas, methods, components, and hooks:

```typescript
export const Registry = {
  entities: {
    'browser': {
      state: z.object({ history: z.array(z.string()) }),
      methods: {
        'browser.search': { input: z.object({ query: z.string() }), result: z.array(z.string()) },
        'browser.read': { input: z.object({ url: z.string() }), result: z.string() },
      },
      components: [],
      hooks: [{ method: 'onInit', type: 'Init' }],
    },
  },
} as const;
```

### Configurable Fields

UI schema for `@Configurable` properties:

```typescript
export const ConfigurableFields = {
  'brain': [
    { key: 'personality', label: 'Personality', group: 'Config', type: 'string' },
  ],
} as const;
```

### Type Helpers

```typescript
export type EntityType = 'agent' | 'brain' | 'browser' | 'memory';
export type MethodName = 'browser.search' | 'browser.read' | 'memory.store';
```

### Deployment Plan

Also generates `deployment.json`. See [Deployment](./deployment.md).

## Build-time Checks

The build catches mistakes before your app runs:

| Problem | Result |
|---------|--------|
| State property missing `@State` | Build fails |
| Property not `private` | Build fails |
| `@Component` references unknown entity | Build fails |
| `@Ref` target doesn't exist as sibling | Build fails |
| Public method missing `@Tool` | Build fails |
| `@Hook` without runner or typed parameter | Build fails |
| `@LLMEntity` missing `@Executor` or `@Context` | Build fails |
| `@LLMExecutionTrigger` without `@Tool` methods | Build fails |

---

## What's Next?

- [Deployment](./deployment.md): how to deploy units from the generated plan
