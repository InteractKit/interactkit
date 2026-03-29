import { RedisPubSubAdapter } from "@interactkit/redis";
import type { InteractKitConfig } from "@interactkit/sdk";
export default { database: undefined!, pubsub: new RedisPubSubAdapter() } satisfies InteractKitConfig;
