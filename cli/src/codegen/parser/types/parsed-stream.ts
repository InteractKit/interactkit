import type { ParsedType } from '@/codegen/utils/types/parsed-type.js';

export interface ParsedStream {
  propertyName: string;
  /** Rich parsed payload type */
  payloadType: ParsedType;
  /** Zod code for payload validation */
  payloadZod: string;
  isPrivate: boolean;
}
