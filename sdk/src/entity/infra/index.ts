import type { EntityMeta } from '../decorators/index.js';

export interface InfraContext {}

export function resolveInfra(_meta: EntityMeta, _parentInfra: InfraContext): InfraContext {
  return {};
}
