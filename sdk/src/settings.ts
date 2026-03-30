import type { DatabaseAdapter } from "./database/adapter.js";
import type {
  LocalPubSubAdapter,
  RemotePubSubAdapter,
} from "./pubsub/adapter.js";
import type { ObserverAdapter } from "./observer/adapter.js";
import type { BaseEntity } from "./entity/types.js";

/**
 * Typed project settings — exported from interactkit.config.ts.
 *
 * ```typescript
 * import { PrismaDatabaseAdapter } from '@interactkit/prisma';
 * import { RedisPubSubAdapter } from '@interactkit/redis';
 * import { DashboardObserver } from '@interactkit/observer';
 * import { DevObserver } from '@interactkit/sdk';
 * import type { InteractKitConfig } from '@interactkit/sdk';
 * import { Agent } from './src/entities/agent.js';
 *
 * export default {
 *   root: Agent,
 *   database: new PrismaDatabaseAdapter({ url: 'file:./app.db' }),
 *   pubsub: new RedisPubSubAdapter({ host: 'localhost', port: 6379 }),
 *   observers: [new DevObserver(), new DashboardObserver()],
 * } satisfies InteractKitConfig;
 * ```
 */
export interface InteractKitConfig {
  /** Root entity class — the entry point of the entity tree. */
  root?: { prototype: BaseEntity } & Function;
  /** Database adapter instance — required for state persistence. */
  database: DatabaseAdapter;
  /** Remote pubsub adapter — required. Use DevPubSubAdapter for local dev, RedisPubSubAdapter for production. */
  pubsub: RemotePubSubAdapter;
  /** Local bus — defaults to InProcessBusAdapter if not provided. */
  localBus?: LocalPubSubAdapter;
  /** Observers — see all events flowing through the bus, can emit events back. */
  observers?: ObserverAdapter[];
  /** Hook init config — passed to HookRunner.init(). Each hook reads the keys it needs. */
  hooks?: Record<string, unknown>;
  /** Event bus request timeout in ms. Default: 30000 */
  timeout?: number;
  /** State persistence debounce interval in ms. Default: 10 */
  stateFlushMs?: number;
}
