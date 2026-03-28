export interface ParsedRef {
  propertyName: string;
  /** Target entity type identifier */
  targetEntityType: string;
  /** Target class name (before type conversion) */
  targetClassName: string;
  isPrivate: boolean;
  /** Whether the user typed Remote<T> (required for distributed entities) */
  isRemote: boolean;
}
