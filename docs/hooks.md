# Hooks

Hooks let entities react to things: startup, timers, HTTP requests, cron schedules, and more.

Add `@Hook(Runner)` to a method. The runner tells InteractKit *when* to call it. Config goes in `Runner(config)`.

## Init: Run on Startup

```typescript
import { Hook, Init } from '@interactkit/sdk';

@Hook(Init.Runner())
async onInit(input: Init.Input) {
  console.log(`Ready! First boot: ${input.firstBoot}`);
}
```

Runs once when the entity starts. `firstBoot` tells you if this is a fresh start or a restart with saved state.

## Tick: Run on an Interval

```typescript
import { Hook, Tick } from '@interactkit/sdk';

@Hook(Tick.Runner({ intervalMs: 5000 }))
async onTick(input: Tick.Input) {
  console.log(`Tick #${input.tick}`);
}
```

Runs every 5 seconds. Default is 60 seconds if you don't specify.

## Cron: Run on a Schedule

```typescript
import { Hook } from '@interactkit/sdk';
import { Cron } from '@interactkit/cron';

@Hook(Cron.Runner({ expression: '0 * * * *' }))
async onSchedule(input: Cron.Input) {
  console.log('Runs every hour');
}
```

Standard cron expressions, powered by `node-cron`. Install: `pnpm add @interactkit/cron`.

Timezone can be set globally in `interactkit.config.ts`:

```typescript
export default {
  // ...
  hooks: { cron: { timezone: 'America/New_York' } },
} satisfies InteractKitConfig;
```

## Multiple Hooks

One entity can have as many hooks as it needs:

```typescript
import { Entity, BaseEntity, Hook, Init, Tick } from '@interactkit/sdk';
import { Cron } from '@interactkit/cron';

@Entity()
class Worker extends BaseEntity {
  @Hook(Init.Runner())
  async onInit(input: Init.Input) { /* setup */ }

  @Hook(Tick.Runner({ intervalMs: 10000 }))
  async onTick(input: Tick.Input) { /* periodic work */ }

  @Hook(Cron.Runner({ expression: '0 9 * * 1' }))
  async onSchedule(input: Cron.Input) { /* every Monday 9am */ }
}
```

## Local vs Remote Hooks

- **Local** (`inProcess: true`): Init hooks run in the entity process. The runner is created, init'd, and register'd all in one place.
- **Remote** (`inProcess: false`): Tick, Cron, HTTP, WebSocket hooks run in a separate `_hooks.ts` process. The hook process calls `init()` to set up shared resources, then listens for entity registrations via pubsub. Each entity sends a register event on boot; the hook process calls `register(emit, config)` per entity.

For detached entities, use `Remote<T>` on the input type for type-safe proxy access:

```typescript
import { Hook, type Remote } from '@interactkit/sdk';
import { HttpRequest } from '@interactkit/http';

@Hook(HttpRequest.Runner({ path: '/webhook' }))
async onRequest(input: Remote<HttpRequest.Input>) {
  const method = await input.method;    // property access returns Promise
  await input.respond(200, 'ok');       // function calls work transparently
}
```

---

## Custom Hooks (Extensions)

Extension packages export their own `Runner` + `Input` under a namespace. Use them the same way:

```typescript
import { Sms } from '@interactkit/twilio';

@Hook(Sms.Runner({ phoneNumber: '+1234567890' }))
async onSms(input: Sms.Input) {
  console.log(`SMS from ${input.from}: ${input.body}`);
}
```

---

## What's Next?

- [Extensions](./extensions.md): build custom hook types as packages
- [Infrastructure](./infrastructure.md): database, pub/sub, and observer adapters
