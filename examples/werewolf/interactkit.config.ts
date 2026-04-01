import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevPubSubAdapter, DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';
import { Game } from './src/entities/game.js';

export default {
  root: Game,
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  pubsub: new DevPubSubAdapter(),
  observers: [new DevObserver()],
  timeout: 120_000,
} satisfies InteractKitConfig;
