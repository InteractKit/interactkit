import type { SubValidator } from '../types/sub-validator.js';

/** Components must reference known entity types, be private, and always use Remote<T>. */
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

    if (!comp.isRemote) {
      errors.push(
        `${loc}: component "${comp.propertyName}" must be typed as Remote<${comp.className}> — ` +
        `this ensures switching between local and distributed requires no code changes`,
      );
    }
  }

  return errors;
};
