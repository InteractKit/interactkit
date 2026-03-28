import type { ParsedType } from '@/codegen/utils/types/parsed-type.js';
import type { FieldMeta } from './field-meta.js';

export interface ParsedStateVar {
  /** Property name */
  name: string;
  /** Rich parsed type */
  type: ParsedType;
  /** Zod validation code string */
  zodCode: string;
  /** Whether the property has ? token */
  optional: boolean;
  /** Field metadata (e.g. @Secret) */
  fieldMeta: FieldMeta;
  /** Has @State decorator */
  hasState: boolean;
  /** Has @Describe decorator */
  hasDescribe: boolean;
  /** Has @Executor decorator */
  hasExecutor: boolean;
  /** Is the property private */
  isPrivate: boolean;
  /** Description from @State({ description: '...' }) */
  description?: string;
  /** Raw validation code from @State({ validate: ... }) */
  validation?: string;
  /** Default value initializer text */
  defaultValue?: string;
}
