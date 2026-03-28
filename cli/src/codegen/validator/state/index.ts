import type { SubValidator } from '../types/sub-validator.js';

/** State properties must have @State decorator and be private. */
export const validateState: SubValidator = (entity) => {
  const errors: string[] = [];
  const loc = `${entity.className} (${entity.type})`;

  for (const prop of entity.state) {
    if (!prop.hasState && !prop.hasDescribe && !prop.hasExecutor) {
      errors.push(`${loc}: state property "${prop.name}" requires @State({ description: '...' })`);
    }
    if (!prop.isPrivate) {
      errors.push(`${loc}: state property "${prop.name}" must be private — only @Tool methods can be public`);
    }
  }

  return errors;
};
