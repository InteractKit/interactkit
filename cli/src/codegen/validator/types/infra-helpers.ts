import type { ParsedEntity } from '@/codegen/parser/types/parsed-entity.js';

/**
 * Check if this entity is detached (uses remote pubsub from config).
 */
export function isDetached(entity: ParsedEntity): boolean {
  return entity.infra.detached ?? false;
}
