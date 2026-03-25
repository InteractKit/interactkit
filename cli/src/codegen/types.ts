import type { FieldMeta } from './mappers/validator-mapper.js';

export interface LLMInfo {
  isLLMEntity: boolean;
  contextProp?: string;
  executorProp?: string;
  tools: Array<{ method: string; description: string; name?: string; inputZod: string }>;
  triggers: string[];
  visibleState: string[];
}

export interface InfraInfo {
  pubsub?: string;   // adapter class name from @Entity({ pubsub: X })
  database?: string;  // adapter class name from @Entity({ database: X })
  logger?: string;    // adapter class name from @Entity({ logger: X })
}

export interface EntityInfo {
  type: string;
  persona: boolean;
  className: string;
  sourceFile: string;
  sourcePackage?: string;
  infra: InfraInfo;
  state: PropertyInfo[];
  components: ComponentInfo[];
  streams: StreamInfo[];
  refs: RefInfo[];
  hooks: HookInfo[];
  methods: MethodInfo[];
  configurables: ConfigurableInfo[];
  llm: LLMInfo;
}

export interface PropertyInfo {
  name: string;
  zodCode: string;
  optional: boolean;
  fieldMeta: FieldMeta;
}

export interface ComponentInfo {
  propertyName: string;
  entityType: string;
}

export interface StreamInfo {
  propertyName: string;
  payloadZod: string;
}

export interface RefInfo {
  propertyName: string;
  targetEntityType: string;
}

export interface HookInfo {
  methodName: string;
  hookTypeName: string;
  genericConfig?: string;
  sourcePackage?: string;
  runnerExport?: string;
}

export interface MethodInfo {
  eventName: string;
  inputZod: string;
  resultZod: string;
  fieldMeta: Record<string, FieldMeta>;
}

export interface ConfigurableInfo {
  key: string;
  label: string;
  group?: string;
  tsType: string;
  zodCode: string;
}
