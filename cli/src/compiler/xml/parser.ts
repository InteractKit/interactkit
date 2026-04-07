/**
 * XML → GraphIR parser.
 *
 * Reads InteractKit XML entity graph files and produces the
 * intermediate representation used by all subsequent compiler stages.
 */

import { XMLParser } from 'fast-xml-parser';
import type {
  GraphIR, EntityIR, EntityTypeKind, FieldIR, FieldTypeKind, FieldGroupIR,
  ValidateIR, SecretIR, ComponentIR, RefIR, StreamIR,
  ToolIR, ToolOutputIR, ParamIR, AutoToolIR, AutoOp,
  ExecutorIR, LLMProviderKind, ThinkingLoopIR,
  McpIR, McpTransportIR, McpStdioIR, McpHttpIR, McpSseIR,
} from '../ir.js';

// ─── XML Parser config ─────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (_name: string, jpath: any, _isLeaf: boolean, _isAttr: boolean) => {
    jpath = String(jpath);
    // Force arrays for elements that can appear multiple times
    const arrayPaths = [
      'graph.entity',
      'entity.state.field',
      'entity.state.fieldGroup',
      'fieldGroup.field',
      'entity.secrets.secret',
      'entity.components.component',
      'entity.refs.ref',
      'entity.tools.tool',
      'entity.tools.autotool',
      'entity.streams.stream',
      'tool.input.param',
      'tool.output.param',
      'field.field',
      'param.param',
      'stdio.env',
      'http.header',
      'sse.header',
    ];
    return arrayPaths.some(p => jpath.endsWith(p));
  },
});

// ─── Public API ─────────────────────────────────────────

export function parseXML(xmlContent: string): GraphIR {
  const doc = xmlParser.parse(xmlContent);
  const graph = doc.graph ?? doc['ik:graph'] ?? doc;

  if (!graph) {
    throw new Error('XML must have a <graph> root element');
  }

  const entities = toArray(graph.entity).map(parseEntity);

  return {
    version: attr(graph, 'version') ?? '1',
    root: attr(graph, 'root'),
    entities,
  };
}

// ─── Entity ─────────────────────────────────────────────

function parseEntity(node: any): EntityIR {
  return {
    name: requireAttr(node, 'name', 'entity'),
    type: requireAttr(node, 'type', 'entity') as EntityTypeKind,
    description: attr(node, 'description'),
    describe: typeof node.describe === 'string' ? node.describe
      : node.describe?.['#text'] ?? undefined,
    remote: attr(node, 'remote'),
    state: toArray(node.state?.field).map(parseField),
    fieldGroups: toArray(node.state?.fieldGroup).map(parseFieldGroup),
    secrets: toArray(node.secrets?.secret).map(parseSecret),
    components: toArray(node.components?.component).map(parseComponent),
    refs: toArray(node.refs?.ref).map(parseRef),
    tools: toArray(node.tools?.tool).map(parseTool),
    autotools: toArray(node.tools?.autotool).map(parseAutoTool),
    streams: toArray(node.streams?.stream).map(parseStream),
    executor: node.executor ? parseExecutor(node.executor) : undefined,
    thinkingLoop: node['thinking-loop'] ? parseThinkingLoop(node['thinking-loop']) : undefined,
    mcp: node.mcp ? parseMcp(node.mcp) : undefined,
  };
}

// ─── State fields ───────────────────────────────────────

function parseField(node: any): FieldIR {
  return {
    name: requireAttr(node, 'name', 'field'),
    type: requireAttr(node, 'type', 'field') as FieldTypeKind,
    description: requireAttr(node, 'description', 'field'),
    default: attr(node, 'default'),
    optional: boolAttr(node, 'optional', false),
    configurable: boolAttr(node, 'configurable', false),
    configurableLabel: attr(node, 'configurable-label'),
    configurableGroup: attr(node, 'configurable-group'),
    items: attr(node, 'items') as FieldTypeKind | undefined,
    values: attr(node, 'values') as FieldTypeKind | undefined,
    validate: node.validate ? parseValidate(node.validate) : undefined,
    children: toArray(node.field).map(parseField),
  };
}

function parseValidate(node: any): ValidateIR {
  const enumStr = attr(node, 'enum');
  return {
    minLength: numAttr(node, 'min-length'),
    maxLength: numAttr(node, 'max-length'),
    pattern: attr(node, 'pattern'),
    format: attr(node, 'format') as ValidateIR['format'],
    min: numAttr(node, 'min'),
    max: numAttr(node, 'max'),
    integer: boolAttr(node, 'integer', false) || undefined,
    minItems: numAttr(node, 'min-items'),
    maxItems: numAttr(node, 'max-items'),
    enum: enumStr ? enumStr.split('|').map(s => s.trim()) : undefined,
  };
}

function parseFieldGroup(node: any): FieldGroupIR {
  return {
    name: requireAttr(node, 'name', 'fieldGroup'),
    key: requireAttr(node, 'key', 'fieldGroup'),
    description: attr(node, 'description'),
    fields: toArray(node.field).map(parseField),
  };
}

// ─── Secrets ────────────────────────────────────────────

function parseSecret(node: any): SecretIR {
  return {
    name: requireAttr(node, 'name', 'secret'),
    description: attr(node, 'description'),
    env: attr(node, 'env'),
  };
}

// ─── Structure ──────────────────────────────────────────

function parseComponent(node: any): ComponentIR {
  return {
    name: requireAttr(node, 'name', 'component'),
    entity: requireAttr(node, 'entity', 'component'),
  };
}

function parseRef(node: any): RefIR {
  return {
    name: requireAttr(node, 'name', 'ref'),
    entity: requireAttr(node, 'entity', 'ref'),
  };
}

function parseStream(node: any): StreamIR {
  return {
    name: requireAttr(node, 'name', 'stream'),
    type: (attr(node, 'type') ?? 'string') as FieldTypeKind,
    description: attr(node, 'description'),
    params: toArray(node.param).map(parseParam),
  };
}

// ─── Tools ──────────────────────────────────────────────

function parseTool(node: any): ToolIR {
  if (!node.output) throw new Error(`<tool name="${attr(node, 'name')}"> requires an <output> element`);
  return {
    name: requireAttr(node, 'name', 'tool'),
    description: requireAttr(node, 'description', 'tool'),
    llmCallable: boolAttr(node, 'llm-callable', false),
    peerVisible: boolAttr(node, 'peerVisible', false),
    src: attr(node, 'src'),
    input: toArray(node.input?.param).map(parseParam),
    output: parseToolOutput(node.output),
  };
}

function parseAutoTool(node: any): AutoToolIR {
  return {
    name: requireAttr(node, 'name', 'autotool'),
    on: requireAttr(node, 'on', 'autotool'),
    op: requireAttr(node, 'op', 'autotool') as AutoOp,
    key: attr(node, 'key'),
    peerVisible: boolAttr(node, 'peerVisible', false),
    llmCallable: boolAttr(node, 'llm-callable', false),
  };
}

function parseToolOutput(node: any): ToolOutputIR {
  return {
    type: (attr(node, 'type') ?? 'object') as FieldTypeKind,
    items: attr(node, 'items') as FieldTypeKind | undefined,
    params: toArray(node.param).map(parseParam),
  };
}

function parseParam(node: any): ParamIR {
  return {
    name: requireAttr(node, 'name', 'param'),
    type: requireAttr(node, 'type', 'param') as FieldTypeKind,
    description: attr(node, 'description'),
    optional: boolAttr(node, 'optional', false),
    items: attr(node, 'items') as FieldTypeKind | undefined,
    values: attr(node, 'values') as FieldTypeKind | undefined,
    validate: node.validate ? parseValidate(node.validate) : undefined,
    children: toArray(node.param).map(parseParam),
  };
}

// ─── LLM ────────────────────────────────────────────────

function parseExecutor(node: any): ExecutorIR {
  return {
    provider: requireAttr(node, 'provider', 'executor') as LLMProviderKind,
    model: requireAttr(node, 'model', 'executor'),
    temperature: numAttr(node, 'temperature'),
    maxTokens: numAttr(node, 'max-tokens'),
  };
}

function parseThinkingLoop(node: any): ThinkingLoopIR {
  return {
    intervalMs: numAttr(node, 'interval-ms') ?? 5000,
    softTimeoutMs: numAttr(node, 'soft-timeout-ms') ?? 30000,
    hardTimeoutMs: numAttr(node, 'hard-timeout-ms') ?? 60000,
    contextWindow: numAttr(node, 'context-window') ?? 50,
    innerMonologue: boolAttr(node, 'inner-monologue', true),
    maxSleepTicks: numAttr(node, 'max-sleep-ticks') ?? 12,
    minIntervalMs: numAttr(node, 'min-interval-ms') ?? 1000,
    maxIntervalMs: numAttr(node, 'max-interval-ms') ?? 60000,
    maxDefers: numAttr(node, 'max-defers') ?? 2,
  };
}

// ─── MCP ────────────────────────────────────────────────

function parseMcp(node: any): McpIR {
  const toolsStr = attr(node, 'tools');
  return {
    toolPrefix: attr(node, 'tool-prefix'),
    connectTimeout: numAttr(node, 'connect-timeout') ?? 10000,
    callTimeout: numAttr(node, 'call-timeout') ?? 30000,
    retry: boolAttr(node, 'retry', true),
    maxRetries: numAttr(node, 'max-retries') ?? 3,
    tools: toolsStr ? toolsStr.split('|').map(s => s.trim()) : undefined,
    transport: parseMcpTransport(node),
  };
}

function parseMcpTransport(node: any): McpTransportIR {
  if (node.stdio) return parseStdio(node.stdio);
  if (node.http) return parseHttp(node.http);
  if (node.sse) return parseSse(node.sse);
  throw new Error('<mcp> must contain exactly one of <stdio>, <http>, or <sse>');
}

function parseStdio(node: any): McpStdioIR {
  return {
    type: 'stdio',
    command: requireAttr(node, 'command', 'stdio'),
    args: attr(node, 'args'),
    cwd: attr(node, 'cwd'),
    env: toArray(node.env).map((e: any) => ({
      key: requireAttr(e, 'key', 'env'),
      value: requireAttr(e, 'value', 'env'),
    })),
  };
}

function parseHttp(node: any): McpHttpIR {
  return {
    type: 'http',
    url: requireAttr(node, 'url', 'http'),
    headers: toArray(node.header).map((h: any) => ({
      key: requireAttr(h, 'key', 'header'),
      value: requireAttr(h, 'value', 'header'),
    })),
  };
}

function parseSse(node: any): McpSseIR {
  return {
    type: 'sse',
    url: requireAttr(node, 'url', 'sse'),
    headers: toArray(node.header).map((h: any) => ({
      key: requireAttr(h, 'key', 'header'),
      value: requireAttr(h, 'value', 'header'),
    })),
  };
}

// ─── Helpers ────────────────────────────────────────────

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function attr(node: any, name: string): string | undefined {
  const val = node?.[`@_${name}`];
  return val != null ? String(val) : undefined;
}

function requireAttr(node: any, name: string, element: string): string {
  const val = attr(node, name);
  if (val == null) throw new Error(`<${element}> requires "${name}" attribute`);
  return val;
}

function numAttr(node: any, name: string): number | undefined {
  const val = attr(node, name);
  if (val == null) return undefined;
  const n = Number(val);
  if (Number.isNaN(n)) throw new Error(`Attribute "${name}" must be a number, got "${val}"`);
  return n;
}

function boolAttr(node: any, name: string, defaultVal: boolean): boolean {
  const val = attr(node, name);
  if (val == null) return defaultVal;
  return val === 'true';
}
