import type { DatabaseAdapter } from '@interactkit/sdk';

export interface DatabaseConfig {
  url: string;
}

/**
 * Prisma-backed DatabaseAdapter.
 * Uses a generic key-value model — stores entity state as JSON.
 *
 * Pass connection URL directly: `new PrismaDatabaseAdapter({ url: 'file:./app.db' })`
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
  private readonly dbConfig: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.dbConfig = config;
  }

  private async ensureConnected(): Promise<void> {
    if (this.initialized) return;

    let PrismaClient: any;
    try {
      const { createRequire } = await import('node:module');
      const require = createRequire(process.cwd() + '/package.json');
      PrismaClient = require('@prisma/client').PrismaClient;
    } catch {
      throw new Error('PrismaDatabaseAdapter requires "@prisma/client". Install it: pnpm add @prisma/client');
    }

    this.prisma = new PrismaClient({
      datasources: { db: { url: this.dbConfig.url } },
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
