import { PropertyDeclaration } from 'ts-morph';
import type { ParsedComponent } from '../types/parsed-component.js';
import type { VariableClassification } from '../variable-classifier/index.js';

/**
 * Parse a property classified as 'component' into a ParsedComponent.
 * The `entity` back-reference is populated later in the linking pass.
 */
export function parseComponent(
  prop: PropertyDeclaration,
  classification: Extract<VariableClassification, { kind: 'component' }>,
): ParsedComponent {
  return {
    propertyName: prop.getName(),
    entityType: classification.entityType,
    className: classification.className,
    isPrivate: prop.getScope() === 'private',
    isRemote: classification.isRemote,
  };
}
