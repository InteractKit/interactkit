# Hooks

Hooks are methods decorated with `@Hook()`. The hook type is inferred from the parameter type.

## Built-in hook types

### InitInput — runs once on boot

```typescript
@Hook()
async onInit(input: InitInput) {
  console.log(`Entity ${input.entityId} booted`);
  if (input.firstBoot) {
    // No saved state — set up defaults
  }
}
```

### TickInput — runs at a fixed interval

```typescript
@Hook()
async onTick(input: TickInput<{ intervalMs: 5000 }>) {
  console.log(`Tick #${input.tick}, elapsed: ${input.elapsed}ms`);
}
```

Config is encoded in the generic param. Default interval is 60s.

### CronInput — runs on a cron schedule

```typescript
@Hook()
async onSchedule(input: CronInput<{ expression: '0 * * * *' }>) {
  console.log(`Last run: ${input.lastRun}`);
}
```

### EventInput — reacts to named events

```typescript
@Hook()
async onEvent(input: EventInput<{ action: string }>) {
  console.log(`Event: ${input.eventName} from ${input.source}`, input.payload);
}
```

### WebSocketInput / HttpInput — external ingress

These hook types are defined in the SDK but their **runners** are provided by extension packages:

```typescript
// Requires @interactkit/ws extension
@Hook()
async onConnection(input: WebSocketInput<{ port: 8080 }>) {
  console.log(`WS data from ${input.connectionId}:`, input.data);
}

// Requires @interactkit/http extension
@Hook()
async onWebhook(input: HttpInput<{ port: 3000, path: '/webhook', method: 'POST' }>) {
  console.log('Webhook body:', input.body);
}
```

## Built-in runners

The SDK ships runners for core hook types:

| Hook type | Runner | Behavior |
|-----------|--------|----------|
| `InitInput` | `InitRunner` | Fires once during boot |
| `TickInput` | `TickRunner` | `setInterval` at configured `intervalMs` |
| `CronInput` | `CronRunner` | Polls every 60s, matches 5-field cron expressions |
| `EventInput` | `EventRunner` | Receives events from the bus |

## How hooks work at runtime

1. `boot()` reads `@Hook()` metadata from each entity class
2. For each hook, the runtime determines the hook type from the parameter
3. The matching `HookRunner<T>` is started with the config from the generic param
4. When the runner calls `emit(data)`, the runtime invokes the entity's hook method

## Multiple hooks per entity

An entity can have multiple hooks of different (or the same) types:

```typescript
@Entity({ type: 'worker' })
class Worker extends BaseEntity {
  @Hook()
  async onInit(input: InitInput) { /* ... */ }

  @Hook()
  async onTick(input: TickInput<{ intervalMs: 10000 }>) { /* ... */ }

  @Hook()
  async onSchedule(input: CronInput<{ expression: '0 9 * * 1' }>) { /* ... */ }
}
```

## Error handling

Hooks follow the same error propagation as methods — use standard try/catch:

```typescript
@Hook()
async onTick(input: TickInput<{ intervalMs: 5000 }>) {
  try {
    await this.brain.think({ query: 'next action' });
  } catch (err) {
    console.error('Brain failed:', err);
  }
}
```
