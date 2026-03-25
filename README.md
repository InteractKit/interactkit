# InteractKit

A framework for building persistent, event-driven entity systems with LLM integration.

Write plain TypeScript classes — InteractKit handles state persistence, inter-entity communication, lifecycle hooks, LLM tool calling, and horizontal scaling.

```typescript
@LLMEntity()
@Entity({ type: 'agent', database: PrismaDatabaseAdapter })
class Agent extends BaseEntity {
  @Component() brain!: Brain;
  @Component() memory!: Memory;

  @Context() context = new LLMContext();
  @Executor() llm = new ChatOpenAI({ model: 'gpt-4' });

  @LLMTool({ description: 'Search memory' })
  async search(input: { query: string }) { return this.memory.search(input); }

  @LLMExecutionTrigger()
  async chat(params: LLMExecutionTriggerParams): Promise<string> { return ''; }
}

const ctx = await boot(Agent);
```

## Packages

| Package | Description |
|---------|-------------|
| [`@interactkit/sdk`](sdk/) | Core SDK — decorators, runtime, adapters, LLM integration |
| [`@interactkit/cli`](cli/) | CLI tool — `interactkit build`, `dev`, `start` |

## Examples

| Example | Description |
|---------|-------------|
| [sample-app](examples/sample-app/) | Agent with Brain, Mouth, Memory, Sensor — tests all features |

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | First entity, boot, composition, config |
| [Entities](docs/entities.md) | Decorators, components, refs, streams, validation |
| [Hooks](docs/hooks.md) | Init, tick, cron, event hooks and custom hook types |
| [LLM Entities](docs/llm.md) | AI-powered entities with LangChain |
| [Infrastructure](docs/infrastructure.md) | Adapters, config, per-entity overrides |
| [Deployment](docs/deployment.md) | Deployment planning, scaling |
| [Codegen](docs/codegen.md) | CLI, registry, build-time validation |
| [Extensions](docs/extensions.md) | Custom hook types, runners, extension packages |

## Quick start

```bash
# Install
pnpm add @interactkit/sdk
pnpm add -D @interactkit/cli

# Build (codegen + tsc + deployment plan)
interactkit build

# Run
interactkit start
```

## Monorepo structure

```
interactkit/
  sdk/          @interactkit/sdk — core framework
  cli/          @interactkit/cli — build tooling
  docs/         documentation
  examples/
    sample-app/ demo app with 21 passing tests
```

## Development

```bash
pnpm install
pnpm --filter @interactkit/sdk build
pnpm --filter @interactkit/cli build
cd examples/sample-app && pnpm build && pnpm start
```
