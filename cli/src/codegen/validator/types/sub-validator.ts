import type { ParsedEntity } from '@/codegen/parser/types/parsed-entity.js';
import type { ValidationContext } from './validation-context.js';

/** A sub-validator takes one entity + context and returns error strings. */
export type SubValidator = (entity: ParsedEntity, ctx: ValidationContext) => string[];
