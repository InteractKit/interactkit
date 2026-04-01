import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevPubSubAdapter, DevObserver } from '@interactkit/sdk';
import { DashboardObserver } from '@interactkit/observer';
import type { InteractKitConfig } from '@interactkit/sdk';
import { Startup } from './src/entities/startup.js';

export default {
  root: Startup,
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  pubsub: new DevPubSubAdapter(),
  observers: [new DevObserver(), new DashboardObserver({ port: 4000 })],
  timeout: 120_000,
} satisfies InteractKitConfig;
