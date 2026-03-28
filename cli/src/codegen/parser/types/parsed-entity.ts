import type { ParsedInfra } from './parsed-infra.js';
import type { ParsedStateVar } from './parsed-state-var.js';
import type { ParsedRef } from './parsed-ref.js';
import type { ParsedComponent } from './parsed-component.js';
import type { ParsedStream } from './parsed-stream.js';
import type { ParsedMethod } from './parsed-method.js';
import type { ParsedHook } from './parsed-hook.js';
import type { ParsedConfigurable } from './parsed-configurable.js';
import type { ParsedLLMInfo } from './parsed-llm-info.js';
import type { ParsedMCPInfo } from './parsed-mcp-info.js';

export interface ParsedEntity {
  /** Entity type identifier (from @Entity({ type }) or auto-derived from class name) */
  type: string;
  /** Original TypeScript class name */
  className: string;
  /** Absolute path to the source file */
  sourceFile: string;
  /** npm package name if the entity is from node_modules */
  sourcePackage?: string;
  /** Base class name (e.g. 'LLMEntity', 'BaseEntity') */
  baseClassName?: string;
  /** Whether this entity is a persona */
  persona: boolean;
  /** Whether the class has a custom constructor (validation flag) */
  hasConstructor: boolean;
  /** Infrastructure adapters */
  infra: ParsedInfra;
  /** State properties */
  state: ParsedStateVar[];
  /** Entity references (sibling cross-references) */
  refs: ParsedRef[];
  /** Child entity components (recursive) */
  components: ParsedComponent[];
  /** Event streams */
  streams: ParsedStream[];
  /** Public async methods */
  methods: ParsedMethod[];
  /** Hook methods */
  hooks: ParsedHook[];
  /** Configurable properties */
  configurables: ParsedConfigurable[];
  /** LLM-specific metadata */
  llm: ParsedLLMInfo;
  /** MCP-specific metadata */
  mcp: ParsedMCPInfo;
}
