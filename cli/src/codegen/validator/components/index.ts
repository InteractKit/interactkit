import type { SubValidator } from '../types/sub-validator.js';
import { usesRemotePubsub } from '../types/infra-helpers.js';

/** Components must reference known entity types, be private, and use Remote<T> when distributed. */
export const validateComponents: SubValidator = (entity, ctx) => {
  const errors: string[] = [];
  const loc = `${entity.className} (${entity.type})`;

  for (const comp of entity.components) {
    if (!ctx.entityTypes.has(comp.entityType)) {
      errors.push(`${loc}: @Component "${comp.propertyName}" references unknown entity type "${comp.entityType}"`);
    }
    if (!comp.isPrivate) {
      errors.push(`${loc}: component "${comp.propertyName}" must be private — parent entities should not reach through children (use a method to expose functionality)`);
    }

    if (usesRemotePubsub(entity, ctx.entities) && !comp.isRemote) {
      errors.push(
        `${loc}: component "${comp.propertyName}" communicates over a remote pubsub — ` +
        `type it as Remote<${comp.className}> for type-safe async proxy access`,
      );
    }
  }

  return errors;
};
