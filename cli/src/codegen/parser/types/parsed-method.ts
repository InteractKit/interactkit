import type { ParsedType } from '@/codegen/utils/types/parsed-type.js';
import type { FieldMeta } from './field-meta.js';
import type { ParsedParameter } from './parsed-parameter.js';

export interface ParsedMethod {
  /** Full event name: entityType.methodName */
  eventName: string;
  methodName: string;
  /** Rich parsed input type */
  inputType: ParsedType;
  /** Rich parsed result type */
  resultType: ParsedType;
  /** Zod code for input validation */
  inputZod: string;
  /** Zod code for result validation */
  resultZod: string;
  /** All method parameters */
  parameters: ParsedParameter[];
  /** Per-field metadata */
  fieldMeta: Record<string, FieldMeta>;
  /** Has @Tool decorator */
  hasTool: boolean;
  /** Tool description from @Tool({ description: '...' }) */
  toolDescription?: string;
  /** Tool name override from @Tool({ name: '...' }) */
  toolName?: string;
  /** Whether the method is async */
  isAsync: boolean;
}
