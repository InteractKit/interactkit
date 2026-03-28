import type { ParsedEntity } from '@/codegen/parser/types/parsed-entity.js';

/** Shared context passed to every sub-validator. */
export interface ValidationContext {
  /** All entities in the project */
  entities: ParsedEntity[];
  /** Set of all known entity type identifiers */
  entityTypes: Set<string>;
}
