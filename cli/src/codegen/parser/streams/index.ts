import { PropertyDeclaration } from 'ts-morph';
import type { ParsedStream } from '../types/parsed-stream.js';
import type { VariableClassification } from '../variable-classifier/index.js';

/**
 * Parse a property classified as 'stream' into a ParsedStream.
 */
export function parseStream(
  prop: PropertyDeclaration,
  classification: Extract<VariableClassification, { kind: 'stream' }>,
): ParsedStream {
  return {
    propertyName: prop.getName(),
    payloadType: classification.payloadType,
    payloadZod: classification.payloadZod,
    isPrivate: prop.getScope() === 'private',
  };
}
