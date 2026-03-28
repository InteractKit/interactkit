import type { ParsedEntity } from './parsed-entity.js';

export interface ParsedComponent {
  propertyName: string;
  /** Child entity type identifier */
  entityType: string;
  /** Child class name */
  className: string;
  isPrivate: boolean;
  /** Whether the user typed Remote<T> (required for distributed entities) */
  isRemote: boolean;
  /** Resolved child entity (set after all entities are parsed) */
  entity?: ParsedEntity;
}
