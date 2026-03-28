# Hooks

Hooks let entities react to things: startup, timers, schedules, and events.

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
import { Hook, Cron } from '@interactkit/sdk';

@Hook(Cron.Runner({ expression: '0 * * * *' }))
async onSchedule(input: Cron.Input) {
  console.log('Runs every hour');
}
```

Standard 5-field cron: `minute hour day month weekday`.

## Event: React to Events

```typescript
import { Hook, Event } from '@interactkit/sdk';

@Hook(Event.Runner())
async onEvent(input: Event.Input<{ action: string }>) {
  console.log(`Got event: ${input.eventName}`, input.payload);
}
```

Fires when another entity publishes an event to the bus.

## Multiple Hooks

One entity can have as many hooks as it needs:

```typescript
import { Entity, BaseEntity, Hook, Init, Tick, Cron } from '@interactkit/sdk';

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

## Remote Hooks and `Remote<T>`

Non-inProcess hooks (Tick, Cron, HTTP, etc.) run in a separate hook server process. When the entity uses `RemotePubSubAdapter`, hook inputs are delivered via pub/sub. Use `Remote<T>` on the input type for type safety:

```typescript
import { Hook, type Remote } from '@interactkit/sdk';
import { HttpRequest } from '@interactkit/http';

@Hook(HttpRequest.Runner({ port: 3100, path: '/webhook' }))
async onRequest(input: Remote<HttpRequest.Input>) {
  const method = await input.method;    // property access returns Promise
  await input.respond(200, 'ok');       // function calls work transparently
}
```

`Remote<T>` on hook inputs is enforced at build time for entities with remote pubsub. `Init` hooks are exempt -- they always run in-process.

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
- [Infrastructure](./infrastructure.md): database, pub/sub, and logging
