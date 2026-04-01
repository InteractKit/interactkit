import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevPubSubAdapter, DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';
import { Pipeline } from './src/entities/pipeline.js';

export default {
  root: Pipeline,
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  pubsub: new DevPubSubAdapter(),
  observers: [new DevObserver()],
  timeout: 120_000,
} satisfies InteractKitConfig;
