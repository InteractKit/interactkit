import type { SubValidator } from '../types/sub-validator.js';

/** Entities must not define a custom constructor. */
export const validateConstructor: SubValidator = (entity) => {
  if (entity.hasConstructor) {
    const loc = `${entity.className} (${entity.type})`;
    return [`${loc}: entities must not define a constructor — BaseEntity's constructor is framework-managed. Use @Hook(Init.Runner()) for initialization logic`];
  }
  return [];
};
