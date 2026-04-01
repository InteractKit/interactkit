import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevPubSubAdapter, DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';
import { Notepad } from './src/entities/notepad.js';

export default {
  root: Notepad,
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  pubsub: new DevPubSubAdapter(),
  observers: [new DevObserver()],
  timeout: 120_000,
} satisfies InteractKitConfig;
