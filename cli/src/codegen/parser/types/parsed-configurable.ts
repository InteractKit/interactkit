import type { ParsedType } from '@/codegen/utils/types/parsed-type.js';

export interface ParsedConfigurable {
  key: string;
  label: string;
  group?: string;
  /** Rich parsed type */
  type: ParsedType;
  /** TypeScript type text */
  tsType: string;
  /** Zod validation code */
  zodCode: string;
}
