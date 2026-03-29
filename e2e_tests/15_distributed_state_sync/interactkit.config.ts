import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { RedisPubSubAdapter } from '@interactkit/redis';
import type { InteractKitConfig } from '@interactkit/sdk';

export default {
  database: new PrismaDatabaseAdapter({ url: process.env.DATABASE_URL ?? 'file:./interactkit.db' }),
  pubsub: new RedisPubSubAdapter(),
} satisfies InteractKitConfig;
