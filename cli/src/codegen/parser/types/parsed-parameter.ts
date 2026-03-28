import type { ParsedType } from '@/codegen/utils/types/parsed-type.js';

export interface ParsedParameter {
  name: string;
  type: ParsedType;
  optional: boolean;
}
