# Entities

## @Entity decorator

Every entity class needs `@Entity` and must extend `BaseEntity`:

```typescript
@Entity({ type: 'person', persona: true })
class Person extends BaseEntity {
  name = 'Alice';
}
```

| Option | Type | Description |
|--------|------|-------------|
| `type` | `string` | **Required.** Unique entity type name. |
| `persona` | `boolean` | Marks entity as a persona (used by dashboard). |
| `database` | `constructor` | DatabaseAdapter override. Sub-entities inherit. |
| `pubsub` | `constructor` | PubSubAdapter override. Sub-entities inherit. |
| `logger` | `constructor` | LogAdapter override. Sub-entities inherit. |

## Property classification

The SDK infers the role of each property from its type — no extra decorators needed:

| Property type | Role | Example |
|---------------|------|---------|
| Primitive (`string`, `number`, `boolean`, etc.) | **State** — persisted, editable | `name = 'Alice'` |
| Entity class | **Component** — child entity, proxied via event bus | `brain: Brain` |
| `EntityRef<T>` | **Ref** — cross-reference to a sibling entity | `phone: EntityRef<Phone>` |
| `EntityStream<T>` | **Stream** — typed data flow from child to parent | `output: EntityStream<string>` |

## Components

Mark child entity properties with `@Component()`. The SDK instantiates the child and creates a proxy:

```typescript
@Entity({ type: 'brain' })
class Brain extends BaseEntity {
  async think(input: { query: string }): Promise<string> {
    return `Answer to: ${input.query}`;
  }
}

@Entity({ type: 'person' })
class Person extends BaseEntity {
  @Component() brain!: Brain;  // child component

  async ask(input: { question: string }) {
    return this.brain.think({ query: input.question });
    // Transparently routed through the event bus
  }
}
```

## @Ref — sibling references

`@Ref()` lets a child entity reference a sibling. The parent wires it automatically:

```typescript
@Entity({ type: 'person' })
class Person extends BaseEntity {
  @Component() brain!: Brain;
  @Component() phone!: Phone;
}

@Entity({ type: 'brain' })
class Brain extends BaseEntity {
  @Ref() phone!: Phone;  // ref to sibling — codegen validates at build time

  async handleCall() {
    await this.phone.speak('Hello!');  // same proxy pattern as components
  }
}
```

Codegen validates that the ref target exists as a sibling in the same parent. If not, build fails.

## EntityStream — child-to-parent data flow

Streams let child entities push typed data upstream:

```typescript
@Entity({ type: 'sensor' })
class Sensor extends BaseEntity {
  readings: EntityStream<number>;

  @Hook()
  async onTick(input: TickInput<{ intervalMs: 1000 }>) {
    this.readings.emit(Math.random() * 100);
  }
}

@Entity({ type: 'monitor' })
class Monitor extends BaseEntity {
  sensor: Sensor;

  @Hook()
  async onInit(input: InitInput) {
    this.sensor.readings.on('data', (value) => {
      console.log('Reading:', value);
    });
  }
}
```

Stream lifecycle: `start()` → `data()` (multiple) → `end()`. Or use `emit()` for one-shot (start + data + end).

## @Configurable — UI-editable state

Mark properties as configurable for the dashboard:

```typescript
@Entity({ type: 'bot' })
class Bot extends BaseEntity {
  @Configurable({ label: 'Bot Name', group: 'General' })
  name = 'DefaultBot';

  @Configurable({ label: 'Response Delay (ms)', group: 'Tuning' })
  delayMs = 1000;
}
```

Codegen extracts these into `ConfigurableFields` in the generated registry.

## @Secret — sensitive fields

```typescript
import { Secret } from '@interactkit/sdk';

@Entity({ type: 'api-client' })
class ApiClient extends BaseEntity {
  @Secret()
  apiKey: string;  // masked in UI and logs
}
```

## Validation with class-validator

Use standard class-validator decorators on state properties:

```typescript
import { MaxLength, MinLength, IsEmail, Min, Max } from 'class-validator';

@Entity({ type: 'user' })
class User extends BaseEntity {
  @MinLength(3) @MaxLength(50)
  username: string;

  @IsEmail()
  email: string;

  @Min(0) @Max(100)
  score: number;
}
```

Codegen reads these to generate Zod validators in the registry.

## Entity IDs

IDs are auto-generated and scoped to the parent:

```
person:a1b2c3
person:a1b2c3/brain:d4e5f6
person:a1b2c3/phone:g7h8i9
```

Access via `this.id` (readonly). You never set IDs manually.
