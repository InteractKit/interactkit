import type { SubValidator } from '../types/sub-validator.js';

/** All public methods must have @Tool decorator. */
export const validateMethods: SubValidator = (entity) => {
  const errors: string[] = [];
  const loc = `${entity.className} (${entity.type})`;

  for (const method of entity.methods) {
    if (!method.hasTool) {
      errors.push(`${loc}: public method "${method.methodName}" requires @Tool({ description: '...' }) — all public methods must be decorated with @Tool`);
    }
  }

  return errors;
};
