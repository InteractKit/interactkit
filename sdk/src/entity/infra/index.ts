import type { EntityMeta } from '../decorators/index.js';
import type { DatabaseAdapter } from '../../database/adapter.js';
import type { PubSubAdapter } from '../../pubsub/adapter.js';
import type { LogAdapter } from '../../logger/adapter.js';

export interface InfraContext {
  pubsub: PubSubAdapter;
  database?: DatabaseAdapter;
  logger?: LogAdapter;
}

export function resolveInfra(meta: EntityMeta, parentInfra: InfraContext): InfraContext {
  return {
    pubsub: meta.pubsub ? new meta.pubsub() : parentInfra.pubsub,
    database: meta.database ? new meta.database() : parentInfra.database,
    logger: meta.logger ? new meta.logger() : parentInfra.logger,
  };
}
