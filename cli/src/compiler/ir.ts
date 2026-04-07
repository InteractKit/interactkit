/**
 * InteractKit Intermediate Representation (IR)
 *
 * These types mirror the XSD schema and serve as the compiler's internal
 * representation after XML parsing. All subsequent stages (validation,
 * ref inference, code generation) operate on these types.
 */

// ─── Root ───────────────────────────────────────────────

export interface GraphIR {
  version: string;
  root?: string;
  entities: EntityIR[];
}

// ─── Entity ─────────────────────────────────────────────

export type EntityTypeKind =
  | 'base'
  | 'llm'
  | 'mcp'
  | 'conversation-context'
  | 'long-term-memory';

export interface EntityIR {
  name: string;
  type: EntityTypeKind;
  description?: string;
  describe?: string;
  /** Remote service URL — entity is proxied over HTTP, schema fetched at compile time */
  remote?: string;
  state: FieldIR[];
  fieldGroups: FieldGroupIR[];
  secrets: SecretIR[];
  components: ComponentIR[];
  refs: RefIR[];
  tools: ToolIR[];
  autotools: AutoToolIR[];
  streams: StreamIR[];
  executor?: ExecutorIR;
  thinkingLoop?: ThinkingLoopIR;
  mcp?: McpIR;
}

// ─── State ──────────────────────────────────────────────

export type FieldTypeKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'record';

export interface FieldIR {
  name: string;
  type: FieldTypeKind;
  description: string;
  default?: string;
  optional: boolean;
  configurable: boolean;
  configurableLabel?: string;
  configurableGroup?: string;
  /** Element type for arrays */
  items?: FieldTypeKind;
  /** Value type for records */
  values?: FieldTypeKind;
  /** Validation constraints */
  validate?: ValidateIR;
  /** Nested fields for object types */
  children: FieldIR[];
}

export interface ValidateIR {
  // String
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'email' | 'url' | 'uuid' | 'datetime' | 'date';
  // Number
  min?: number;
  max?: number;
  integer?: boolean;
  // Array
  minItems?: number;
  maxItems?: number;
  // Enum (pipe-separated in XML, parsed to array here)
  enum?: string[];
}

// ─── Field Groups ───────────────────────────────────────

export interface FieldGroupIR {
  name: string;
  key: string;
  description?: string;
  fields: FieldIR[];
}

// ─── Secrets ────────────────────────────────────────────

export interface SecretIR {
  name: string;
  description?: string;
  /** Environment variable to read from */
  env?: string;
}

// ─── Structure ──────────────────────────────────────────

export interface ComponentIR {
  name: string;
  entity: string;
}

export interface RefIR {
  name: string;
  entity: string;
  /** If true, this ref was auto-inferred from peerVisible tools */
  inferred?: boolean;
  /** If inferred, only these tools are exposed on the ref proxy */
  visibleTools?: string[];
}

export interface StreamIR {
  name: string;
  type: FieldTypeKind;
  description?: string;
  /** Nested params for object payload streams */
  params: ParamIR[];
}

// ─── Tools ──────────────────────────────────────────────

export interface ToolIR {
  name: string;
  description: string;
  llmCallable: boolean;
  peerVisible: boolean;
  /** Path to handler implementation file (relative to interactkit/ dir) */
  src?: string;
  /** True if this tool was expanded from an autotool */
  auto?: boolean;
  input: ParamIR[];
  output: ToolOutputIR;
}

export type AutoOp = 'create' | 'read' | 'update' | 'delete' | 'list' | 'search' | 'count';

export interface AutoToolIR {
  name: string;
  /** Which fieldGroup to operate on */
  on: string;
  op: AutoOp;
  /** Key field for read/update/delete/search */
  key?: string;
  peerVisible: boolean;
  llmCallable: boolean;
}

export interface ToolOutputIR {
  type: FieldTypeKind;
  items?: FieldTypeKind;
  params: ParamIR[];
}

export interface ParamIR {
  name: string;
  type: FieldTypeKind;
  description?: string;
  optional: boolean;
  /** Element type for arrays */
  items?: FieldTypeKind;
  /** Value type for records */
  values?: FieldTypeKind;
  /** Validation constraints */
  validate?: ValidateIR;
  /** Nested params for object types */
  children: ParamIR[];
}

// ─── LLM ────────────────────────────────────────────────

export type LLMProviderKind = 'openai' | 'anthropic' | 'google' | 'ollama';

export interface ExecutorIR {
  provider: LLMProviderKind;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ThinkingLoopIR {
  intervalMs: number;
  softTimeoutMs: number;
  hardTimeoutMs: number;
  contextWindow: number;
  innerMonologue: boolean;
  maxSleepTicks: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  maxDefers: number;
}

// ─── MCP ────────────────────────────────────────────────

export interface McpIR {
  toolPrefix?: string;
  connectTimeout: number;
  callTimeout: number;
  retry: boolean;
  maxRetries: number;
  /** Pipe-separated in XML, parsed to array here */
  tools?: string[];
  transport: McpTransportIR;
}

export type McpTransportIR = McpStdioIR | McpHttpIR | McpSseIR;

export interface McpStdioIR {
  type: 'stdio';
  command: string;
  args?: string;
  cwd?: string;
  env: Array<{ key: string; value: string }>;
}

export interface McpHttpIR {
  type: 'http';
  url: string;
  headers: Array<{ key: string; value: string }>;
}

export interface McpSseIR {
  type: 'sse';
  url: string;
  headers: Array<{ key: string; value: string }>;
}
