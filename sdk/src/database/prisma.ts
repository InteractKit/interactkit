import type { DatabaseAdapter } from './adapter.js';
import { resolveDatabaseConfig } from '../config.js';

/**
 * Prisma-backed DatabaseAdapter.
 * Uses a generic key-value model — stores entity state as JSON.
 *
 * Config resolution (in order):
 *   1. node-config: interactkit.database.url
 *   2. Env var: DATABASE_URL
 *   3. Default: file:./interactkit.db
 *
 * Expects a Prisma client with an `entityState` model:
 *   model EntityState {
 *     id    String @id
 *     state Json
 *   }
 */
export class PrismaDatabaseAdapter implements DatabaseAdapter {
  private prisma: any;
  private initialized = false;

  constructor() {
    // Lazy init
  }

  private async ensureConnected(): Promise<void> {
    if (this.initialized) return;

    const config = resolveDatabaseConfig();
    let PrismaClient: any;
    try {
      // Resolve from CWD so the user's @prisma/client is found (not the SDK's node_modules)
      const { createRequire } = await import('node:module');
      const require = createRequire(process.cwd() + '/package.json');
      PrismaClient = require('@prisma/client').PrismaClient;
    } catch {
      throw new Error('PrismaDatabaseAdapter requires "@prisma/client". Install it: pnpm add @prisma/client');
    }

    this.prisma = new PrismaClient({
      datasources: { db: { url: config.url } },
    });

    this.initialized = true;
  }

  async get(entityId: string): Promise<Record<string, unknown> | null> {
    await this.ensureConnected();
    const row = await this.prisma.entityState.findUnique({ where: { id: entityId } });
    if (!row?.state) return null;
    return typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
  }

  async set(entityId: string, state: Record<string, unknown>): Promise<void> {
    await this.ensureConnected();
    const serialized = JSON.stringify(state);
    await this.prisma.entityState.upsert({
      where: { id: entityId },
      update: { state: serialized },
      create: { id: entityId, state: serialized },
    });
  }

  async delete(entityId: string): Promise<void> {
    await this.ensureConnected();
    await this.prisma.entityState.delete({ where: { id: entityId } }).catch(() => {});
  }
}
