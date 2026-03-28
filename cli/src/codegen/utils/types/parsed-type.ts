/**
 * Rich recursive type representation for parsed TypeScript types.
 * Replaces raw zod strings with a structural AST that can be
 * inspected, transformed, and then converted to zod code.
 */
export type ParsedType =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'null' }
  | { kind: 'undefined' }
  | { kind: 'void' }
  | { kind: 'any' }
  | { kind: 'unknown' }
  | { kind: 'never' }
  | { kind: 'date' }
  | { kind: 'map'; key: ParsedType; value: ParsedType }
  | { kind: 'set'; element: ParsedType }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'array'; element: ParsedType }
  | { kind: 'tuple'; elements: ParsedType[] }
  | { kind: 'object'; properties: ParsedProperty[] }
  | { kind: 'record'; key: ParsedType; value: ParsedType }
  | { kind: 'union'; members: ParsedType[] }
  | { kind: 'intersection'; members: ParsedType[] }
  | { kind: 'enum'; values: Array<string | number> }
  | { kind: 'promise'; inner: ParsedType };

export interface ParsedProperty {
  name: string;
  type: ParsedType;
  optional: boolean;
}
