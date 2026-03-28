import type { ParsedEntity } from '@/codegen/parser/types/parsed-entity.js';

/**
 * Walk up the entity tree to determine if this entity's effective pubsub is remote.
 * Checks own infra first, then parents that have this entity as a component.
 */
export function usesRemotePubsub(entity: ParsedEntity, allEntities: ParsedEntity[]): boolean {
  if (entity.infra.pubsubIsRemote !== undefined) return entity.infra.pubsubIsRemote;

  for (const parent of allEntities) {
    if (parent.components.some(c => c.entityType === entity.type)) {
      return usesRemotePubsub(parent, allEntities);
    }
  }

  return false;
}
