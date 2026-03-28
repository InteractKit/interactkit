import type { ParsedEntity } from '@/codegen/parser/types/parsed-entity.js';
import type { SubValidator } from './types/sub-validator.js';
import type { ValidationContext } from './types/validation-context.js';
import { validateConstructor } from './constructor/index.js';
import { validateState } from './state/index.js';
import { validateComponents } from './components/index.js';
import { validateRefs } from './refs/index.js';
import { validateMethods } from './methods/index.js';
import { validateHooks } from './hooks/index.js';
import { validateLLM } from './llm/index.js';
import { validateMCP } from './mcp/index.js';

/** All sub-validators run in order for each entity. */
const validators: SubValidator[] = [
  validateConstructor,
  validateState,
  validateComponents,
  validateRefs,
  validateMethods,
  validateHooks,
  validateLLM,
  validateMCP,
];

/** Validate all entities and return errors. Empty array = all good. */
export function validateEntities(entities: ParsedEntity[]): string[] {
  const ctx: ValidationContext = {
    entities,
    entityTypes: new Set(entities.map(e => e.type)),
  };

  const errors: string[] = [];

  for (const entity of entities) {
    for (const validate of validators) {
      errors.push(...validate(entity, ctx));
    }
  }

  return errors;
}
