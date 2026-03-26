import type { FieldMeta } from './mappers/validator-mapper.js';

export interface MCPInfo {
  isMCPEntity: boolean;
  transport?: string;  // raw text of the transport config object
}

export interface LLMInfo {
  isLLMEntity: boolean;
  contextProp?: string;
  executorProp?: string;
  tools: Array<{ method: string; description: string; name?: string; inputZod: string }>;
  triggers: string[];
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
  mcp: MCPInfo;
  hasConstructor: boolean;
}

export interface PropertyInfo {
  name: string;
  zodCode: string;
  optional: boolean;
  fieldMeta: FieldMeta;
  hasState: boolean;
  hasDescribe: boolean;
  hasExecutor: boolean;
  isPrivate: boolean;
}

export interface ComponentInfo {
  propertyName: string;
  entityType: string;
  isPrivate: boolean;
}

export interface StreamInfo {
  propertyName: string;
  payloadZod: string;
  isPrivate: boolean;
}

export interface RefInfo {
  propertyName: string;
  targetEntityType: string;
  isPrivate: boolean;
}

export interface HookInfo {
  methodName: string;
  hookTypeName: string;
  sourcePackage?: string;
  runnerExport?: string;
}

export interface MethodInfo {
  eventName: string;
  methodName: string;
  inputZod: string;
  resultZod: string;
  fieldMeta: Record<string, FieldMeta>;
  hasTool: boolean;
}

export interface ConfigurableInfo {
  key: string;
  label: string;
  group?: string;
  tsType: string;
  zodCode: string;
}
