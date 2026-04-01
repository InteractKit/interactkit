import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevPubSubAdapter, DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';
import { Arena } from './src/entities/arena.js';

export default {
  root: Arena,
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  pubsub: new DevPubSubAdapter(),
  observers: [new DevObserver()],
  timeout: 120_000,
} satisfies InteractKitConfig;
