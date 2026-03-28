import type { SubValidator } from '../types/sub-validator.js';

/** Refs must target sibling entities, be private, and always use Remote<T>. */
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

    if (!ref.isRemote) {
      errors.push(
        `${loc}: ref "${ref.propertyName}" must be typed as Remote<${ref.targetClassName}> — ` +
        `this ensures switching between local and distributed requires no code changes`,
      );
    }
  }

  return errors;
};
