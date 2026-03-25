# Extensions

The SDK is open by design. External packages can provide entities, custom hook types, and hook runners. Users consume them via standard TypeScript imports.

## Using an extension

```typescript
import { TwilioPhone } from '@interactkit/twilio';

@Entity({ type: 'person' })
class Person extends BaseEntity {
  phone: TwilioPhone;  // codegen follows the import, extracts everything
  brain: Brain;
}
```

That's it. Codegen discovers the external entity via the import, extracts its hooks/methods/state, and the runtime wires it like any other component.

## Building an extension

An extension package exports three things:

### 1. Custom hook input type

Follow the same generic-param pattern as built-in types:

```typescript
// @interactkit/twilio

export interface SmsInput<P extends { phoneNumber: string }> {
  from: string;
  body: string;
}
```

### 2. Hook runner

Implements `HookRunner<T>` — the generic param tells codegen which hook type this runner handles:

```typescript
import type { HookRunner } from '@interactkit/sdk';

export class SmsRunner implements HookRunner<SmsInput> {
  async start(emit: (data: SmsInput<any>) => void, config: { phoneNumber: string }) {
    // Set up Twilio webhook listener
    // When SMS arrives: emit({ from: '+1...', body: 'hello' })
  }

  async stop() {
    // Tear down listener
  }
}
```

The runner is decoupled from entities — it just receives an `emit` function and calls it when external data arrives. The runtime routes the data to the entity's `@Hook` method.

### 3. Entity classes

```typescript
import { Entity, BaseEntity, Hook, Configurable } from '@interactkit/sdk';

@Entity({ type: 'twilio-phone' })
export class TwilioPhone extends BaseEntity {
  @Configurable({ label: 'Phone Number' })
  phoneNumber: string;

  @Hook()
  async onSms(input: SmsInput<{ phoneNumber: '+1234567890' }>) {
    // Handle incoming SMS
  }

  async call(input: { to: string }) { /* ... */ }
  async sendSms(input: { to: string; body: string }) { /* ... */ }
}
```

## Runner discovery

Codegen auto-discovers runners via convention:

1. Codegen sees `@Hook()` method with `SmsInput` param type
2. Resolves `SmsInput` to its source package (`@interactkit/twilio`)
3. Scans that package for classes implementing `HookRunner<SmsInput>`
4. Records the runner in the generated registry
5. Runtime auto-imports and starts the runner

**Convention:** The runner must be exported from the **same package** as the hook input type.

## Custom validation decorators

Validation uses `class-validator` — create custom validators using their built-in API:

```typescript
import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsPhoneNumber(options?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneNumber',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && /^\+\d{10,15}$/.test(value);
        },
      },
    });
  };
}
```

## Package structure

A typical extension package:

```
@interactkit/twilio/
  src/
    types.ts          # SmsInput, CallInput (hook input types)
    runners.ts        # SmsRunner, CallRunner (HookRunner implementations)
    entity.ts         # TwilioPhone (entity class)
    index.ts          # barrel export
  package.json        # depends on @interactkit/sdk
```

The package should list `@interactkit/sdk` as a **peer dependency** and ship TypeScript declarations so codegen can analyze the types.
