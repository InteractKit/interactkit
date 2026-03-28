import type { SubValidator } from '../types/sub-validator.js';
import { usesRemotePubsub } from '../types/infra-helpers.js';

/** Refs must target sibling entities, be private, and use Remote<T> when distributed. */
export const validateRefs: SubValidator = (entity, ctx) => {
  if (entity.refs.length === 0) return [];

  const errors: string[] = [];
  const loc = `${entity.className} (${entity.type})`;

  const parents = ctx.entities.filter(e =>
    e.components.some(c => c.entityType === entity.type)
  );

  for (const ref of entity.refs) {
    const refReachable = parents.some(p =>
      p.components.some(c => c.entityType === ref.targetEntityType)
    );
    if (!refReachable) {
      errors.push(`${loc}: @Ref "${ref.propertyName}" targets "${ref.targetEntityType}" which is not a sibling`);
    }
    if (!ref.isPrivate) {
      errors.push(`${loc}: ref "${ref.propertyName}" must be private — refs are internal wiring, not part of the entity's public API`);
    }

    if (usesRemotePubsub(entity, ctx.entities) && !ref.isRemote) {
      errors.push(
        `${loc}: ref "${ref.propertyName}" communicates over a remote pubsub — ` +
        `type it as Remote<${ref.targetClassName}> for type-safe async proxy access`,
      );
    }
  }

  return errors;
};
