import type { ParsedType } from '@/codegen/utils/types/parsed-type.js';

export interface ParsedLLMTool {
  method: string;
  description: string;
  name?: string;
  /** Rich parsed input type */
  inputType: ParsedType;
  /** Zod code for input validation */
  inputZod: string;
}

export interface ParsedLLMInfo {
  isLLMEntity: boolean;
  contextProp?: string;
  executorProp?: string;
  tools: ParsedLLMTool[];
  triggers: string[];
}
