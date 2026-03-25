# @affiliate-agent/app

World definition package — defines all entities, strategies, and scouts. Uses SDK decorators + types. Contains zero runtime logic.

## What this package provides

All entity definitions for the affiliate agent system. Entities are plain TypeScript classes that extend `BaseEntity`, use SDK wrapper types, and declare typed methods. The SDK codegen reads these to generate the runtime registry.

## Entities

### Channel entities (interact with external platforms)

**RedditEntity** (`entities/reddit/entity.ts`)
- Type: `reddit_account`
- State: `session: Secret<string>`, `rateLimits: Record<string, number>`
- Components: `humanizer: HumanizerEntity`, `affiliate: AffiliateEntity`
- Methods: `discover(input)`, `postComment(input)`, `search(input)`
- Streams: `sessionHealth: EntityStream<...>`, `rateLimited: EntityStream<...>`
- Hooks: `@Hook() onSessionRefresh(CronInput<{ expression: '0 */6 * * *' }>)`
- Client: `client.ts` — HTTP client for Reddit API (reuse from `src/platforms/reddit/client.ts`)

**TwitterEntity** (`entities/twitter/entity.ts`)
- Type: `twitter_account`
- Methods: `search(input)`, `post(input)`
- Client: `client.ts` (reuse from `src/platforms/twitter/client.ts`)

**QuoraEntity** (`entities/quora/entity.ts`)
- Type: `quora_account`
- Methods: `search(input)`, `answer(input)`
- Client: `client.ts` (reuse from `src/platforms/quora/client.ts`)

### Processing entities (embedded as components)

**HumanizerEntity** (`entities/humanizer.entity.ts`)
- Type: `humanizer`
- State: `writingStyle: WritingStyle` (slang, formality, typoRate, maxLength, trailOff, quirks, vocabulary)
- Methods: `humanize({ text: string }): { text: string }`
- Applies vocab swaps, slang injection, typos, trailing off, truncation

**AffiliateEntity** (`entities/affiliate.entity.ts`)
- Type: `affiliate`
- State: `domain: Pattern<string, ...>`, `tag: MinLength<string, 1>`
- Methods: `processLinks({ text: string }): { text: string }`
- Scans text for URLs matching domain, injects affiliate tag param

### Core entities

**WorldEntity** (`entities/world.entity.ts`)
- Type: `world`
- Root of entity tree. Components: Reddit, Twitter, Quora, affiliates, personas.
- State: season, trending topics, market events

**PersonaEntity** (`entities/persona.entity.ts`)
- Type: `persona`, `persona: true`
- State: `name`, `age`, `writingStyle`, etc.
- Components: channel entities (Reddit/Twitter/Quora with humanizer+affiliate inside), `memory: MemoryStoreEntity`, `strategies: StrategyEntity`
- Methods: `recommend(input)`
- Hooks: `onTick(TickInput)`, `onContentDiscovered(EventInput<...>)`, `onMemoryDecay(CronInput<...>)`, `onInit(InitInput)`

**MemoryStoreEntity** (`entities/memory-store.entity.ts`)
- Type: `memory_store`
- Methods: `record(input)`, `query(input)`, `decay(input)`

**CredentialEntity** (`entities/credential.entity.ts`)
- Type: `credential`
- State: `sessionCookie: Secret<string>`, `rateLimit: number`

**CommunityEntity** (`entities/community.entity.ts`)
- Type: `community`
- State: tone, formatting, context, recentPosts

**ProductEntity** (`entities/product.entity.ts`)
- Type: `product`
- State: price, reviews, sentiment

## Strategies (`strategies/`)

Per-persona strategy implementations. Each evaluates content and returns a decision.

- `reactive/` — default, responds to product questions
- `comparison/` — comparison/versus posts
- `deal-hunter/` — price/deal posts
- `seasonal/` — seasonal/holiday content
- `follow-up/` — revisit old threads

## Scouts (`scouts/`)

Query generation strategies for scouter-role personas.

- `trends.ts` — trending topics
- `llmBrainstorm.ts` — LLM-generated queries
- `seasonal.ts` — calendar-based
- `dorks.ts` — search operators
- `competitor.ts` — competitor sites
- `nicheCommunity.ts` — niche community queries

## Key design rules

- **No Zod, no runtime logic** — just class definitions with SDK types
- **No decorators on properties** — codegen infers state/component/stream from types
- **Only `@Entity`, `@Hook`, `@Configurable`** decorators used
- Methods that call components do so directly: `this.humanizer.humanize(...)` — codegen compiles to event bus
- Each channel entity embeds its own humanizer + affiliate as components
- Personas embed channel entities → call `this.reddit.postComment()` which internally runs the full processing chain

## File structure

```
src/
  entities/
    reddit/
      entity.ts
      client.ts          # reuse from src/platforms/reddit/client.ts
    twitter/
      entity.ts
      client.ts
    quora/
      entity.ts
      client.ts
    world.entity.ts
    persona.entity.ts
    humanizer.entity.ts
    affiliate.entity.ts
    community.entity.ts
    product.entity.ts
    memory-store.entity.ts
    credential.entity.ts
  strategies/
    reactive/
    comparison/
    deal-hunter/
    seasonal/
    follow-up/
  scouts/
    trends.ts
    llmBrainstorm.ts
    seasonal.ts
    dorks.ts
    competitor.ts
    nicheCommunity.ts
  __generated__/         # gitignored — created by SDK codegen
    type-registry.ts
    index.ts
  index.ts               # barrel export of all entities + strategies
```

## Dependencies

- `@affiliate-agent/sdk` — decorators, base classes, types
