import type { ParsedType } from '@/codegen/utils/types/parsed-type.js';

export interface ParsedHook {
  methodName: string;
  /** Hook type name (e.g. 'Init', 'Tick') */
  hookTypeName: string;
  /** Source package of the hook type */
  sourcePackage?: string;
  /** Runner export text (e.g. 'Init.Runner()') */
  runnerExport?: string;
  /** Hook runs in-process (skips hook server) */
  inProcess: boolean;
  /** Whether the user typed Remote<T> on the input parameter */
  isRemoteInput: boolean;
  /** Rich parsed input type */
  inputType?: ParsedType;
}
