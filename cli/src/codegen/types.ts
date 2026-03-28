/**
 * Re-exports all parsed types from parser/types/ and provides
 * backward-compatible aliases for consumers (emit, validate, deploy).
 */

export type { ParsedType, ParsedProperty } from './utils/types/parsed-type.js';

// ─── Primary types ──────────────────────────────────────

export type { FieldMeta } from './parser/types/field-meta.js';
export type { ParsedEntity } from './parser/types/parsed-entity.js';
export type { ParsedInfra } from './parser/types/parsed-infra.js';
export type { ParsedStateVar } from './parser/types/parsed-state-var.js';
export type { ParsedRef } from './parser/types/parsed-ref.js';
export type { ParsedComponent } from './parser/types/parsed-component.js';
export type { ParsedStream } from './parser/types/parsed-stream.js';
export type { ParsedParameter } from './parser/types/parsed-parameter.js';
export type { ParsedMethod } from './parser/types/parsed-method.js';
export type { ParsedHook } from './parser/types/parsed-hook.js';
export type { ParsedConfigurable } from './parser/types/parsed-configurable.js';
export type { ParsedLLMInfo, ParsedLLMTool } from './parser/types/parsed-llm-info.js';
export type { ParsedMCPInfo } from './parser/types/parsed-mcp-info.js';

// ─── Backward compatibility aliases ─────────────────────

export type { ParsedEntity as EntityInfo } from './parser/types/parsed-entity.js';
export type { ParsedInfra as InfraInfo } from './parser/types/parsed-infra.js';
export type { ParsedStateVar as PropertyInfo } from './parser/types/parsed-state-var.js';
export type { ParsedComponent as ComponentInfo } from './parser/types/parsed-component.js';
export type { ParsedStream as StreamInfo } from './parser/types/parsed-stream.js';
export type { ParsedRef as RefInfo } from './parser/types/parsed-ref.js';
export type { ParsedHook as HookInfo } from './parser/types/parsed-hook.js';
export type { ParsedMethod as MethodInfo } from './parser/types/parsed-method.js';
export type { ParsedConfigurable as ConfigurableInfo } from './parser/types/parsed-configurable.js';
export type { ParsedLLMInfo as LLMInfo } from './parser/types/parsed-llm-info.js';
export type { ParsedMCPInfo as MCPInfo } from './parser/types/parsed-mcp-info.js';
