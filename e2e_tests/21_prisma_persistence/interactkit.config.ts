import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import type { InteractKitConfig } from '@interactkit/sdk';

export default {
  database: new PrismaDatabaseAdapter({ url: process.env.DATABASE_URL ?? 'file:./interactkit.db' }),
} satisfies InteractKitConfig;
