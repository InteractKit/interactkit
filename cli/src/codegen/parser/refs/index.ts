import { PropertyDeclaration } from 'ts-morph';
import type { ParsedRef } from '../types/parsed-ref.js';
import type { VariableClassification } from '../variable-classifier/index.js';

/**
 * Parse a property classified as 'ref' into a ParsedRef.
 */
export function parseRef(
  prop: PropertyDeclaration,
  classification: Extract<VariableClassification, { kind: 'ref' }>,
): ParsedRef {
  return {
    propertyName: prop.getName(),
    targetEntityType: classification.entityType,
    targetClassName: classification.className,
    isPrivate: prop.getScope() === 'private',
    isRemote: classification.isRemote,
  };
}
