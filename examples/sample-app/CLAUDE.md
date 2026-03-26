# @interactkit/sample-app

Sample app demonstrating all core InteractKit features. Five entities forming a simple agent with LLM-powered decision making.

## Entity tree

```
Agent (root, extends BaseEntity)
  ├── Brain  (extends LLMEntity — @SystemPrompt, @Executor, @Ref → Mouth, @Ref → Memory)
  ├── Mouth  (extends BaseEntity — @Stream transcript)
  ├── Memory (extends BaseEntity — @Configurable capacity)
  └── Sensor (extends BaseEntity — @Stream readings)
```

## Entities

### Agent (`src/entities/agent.ts`)

Root entity. Owns all four children as `@Component`. Subscribes to child streams (`mouth.transcript`, `sensor.readings`) in `@Hook(Init.Runner())`. Delegates LLM chat to `brain.invoke()`.

- State: `name` (configurable, validated with `z.string().min(2).max(50)`), `transcripts`, `sensorReadings`
- Tools: `ask`, `readSensor`, `getTranscripts`, `introduce`, `reflect`, `getSpeechHistory`, `searchMemory`, `getMemoryCount`, `chat`

### Brain (`src/entities/brain.ts`)

LLM entity (extends `LLMEntity`). Uses `@SystemPrompt()` on a getter that interpolates `personality` state. `@Executor()` points to `ChatAnthropic`. References `Mouth` and `Memory` as `@Ref` siblings -- their tools are automatically visible to the LLM.

- State: `personality` (configurable)
- Decorators: `@SystemPrompt()` (getter), `@Executor()` (ChatAnthropic)
- Refs: `mouth` (Mouth), `memory` (Memory)
- Tools: `think` (stores thought in memory), `thinkAndSpeak` (thinks + speaks via mouth), `reflect` (returns all memories)
- Inherited from LLMEntity: `invoke()`, `context`, `response` stream, `toolCall` stream

### Mouth (`src/entities/mouth.ts`)

Speech output entity. Emits spoken messages on the `transcript` stream. Maintains a `history` array of all spoken messages.

- State: `history`
- Streams: `transcript: EntityStream<string>`
- Tools: `speak`, `getHistory`

### Memory (`src/entities/memory.ts`)

Storage entity with configurable capacity and FIFO eviction. Stores string entries, supports keyword search.

- State: `capacity` (configurable, validated with `z.number().min(1).max(1000)`), `entries`
- Tools: `store`, `search`, `getAll`, `count`

### Sensor (`src/entities/sensor.ts`)

Simulated environmental sensor. Emits random readings on the `readings` stream and tracks total count.

- State: `label` (configurable), `readingCount`
- Streams: `readings: EntityStream<number>`
- Tools: `read`, `getReadingCount`

## Key patterns demonstrated

- **LLMEntity base class**: Brain extends `LLMEntity` instead of `BaseEntity`, getting `invoke()`, built-in context, and `response`/`toolCall` streams for free.
- **@SystemPrompt() getter**: Dynamic system prompt that reads entity state (`this.personality`).
- **@Ref sibling calls**: Brain calls `this.mouth.speak()` and `this.memory.store()` directly.
- **@Stream + parent subscription**: Agent subscribes to `mouth.transcript` and `sensor.readings` in Init hook.
- **@Configurable + Zod validation**: UI-editable fields with inline Zod schemas via the `validate` option in `@State()`.

## Run

```bash
pnpm dev    # builds + runs (interactkit dev)
pnpm build  # build only (interactkit build)
pnpm start  # run built app (interactkit start)
```
