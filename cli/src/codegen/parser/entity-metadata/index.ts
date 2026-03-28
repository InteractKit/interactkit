import { ClassDeclaration } from 'ts-morph';
import { parseType, parsedTypeToZod } from '@/codegen/utils/parse-type.js';
import { extractStringProp } from '@/codegen/utils/extract-string-prop.js';
import { extractIdentProp } from '@/codegen/utils/extract-ident-prop.js';
import type { ParsedInfra } from '../types/parsed-infra.js';
import type { ParsedLLMInfo, ParsedLLMTool } from '../types/parsed-llm-info.js';
import type { ParsedMCPInfo } from '../types/parsed-mcp-info.js';

// ─── Entity Metadata ────────────────────────────────────

export interface EntityMetadata {
  type: string;
  className: string;
  sourceFile: string;
  baseClassName?: string;
  persona: boolean;
  infra: ParsedInfra;
  hasConstructor: boolean;
}

/**
 * Extract metadata from the @Entity() decorator on a class.
 * Returns null if the class has no @Entity decorator.
 */
export function extractEntityMetadata(cls: ClassDeclaration): EntityMetadata | null {
  const entityDec = cls.getDecorator('Entity');
  if (!entityDec) return null;

  const args = entityDec.getArguments();
  const optionsText = args.length > 0 ? args[0].getText() : '{}';
  const className = cls.getName() ?? '';
  const type = extractStringProp(optionsText, 'type')
    ?? (className ? className.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() : undefined);
  const persona = optionsText.includes('persona: true') || optionsText.includes('persona:true');

  if (!type) return null;

  const pubsub = extractIdentProp(optionsText, 'pubsub');
  const database = extractIdentProp(optionsText, 'database');
  const logger = extractIdentProp(optionsText, 'logger');

  // Resolve whether pubsub extends RemotePubSubAdapter
  let pubsubIsRemote: boolean | undefined;
  if (pubsub) {
    const sourceFile = cls.getSourceFile();
    const project = sourceFile.getProject();
    // Find the pubsub class declaration in the project
    for (const sf of project.getSourceFiles()) {
      const pubsubClass = sf.getClass(pubsub);
      if (pubsubClass) {
        pubsubIsRemote = extendsClass(pubsubClass, 'RemotePubSubAdapter');
        break;
      }
    }
  }

  const baseClass = cls.getBaseClass();
  const baseClassName = baseClass?.getName();

  return {
    type,
    className,
    sourceFile: cls.getSourceFile().getFilePath(),
    baseClassName,
    persona,
    infra: { pubsub, database, logger, pubsubIsRemote },
    hasConstructor: cls.getConstructors().length > 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────

/** Check if a class extends a given base class name (directly or indirectly). */
function extendsClass(cls: ClassDeclaration, targetName: string): boolean {
  const baseClass = cls.getBaseClass();
  if (!baseClass) return false;
  if (baseClass.getName() === targetName) return true;
  return extendsClass(baseClass, targetName);
}

// ─── LLM Metadata ───────────────────────────────────────

/** Check if a class extends LLMEntity (directly or indirectly). */
function extendsLLMEntity(cls: ClassDeclaration): boolean {
  return extendsClass(cls, 'LLMEntity');
}

/**
 * Extract LLM-specific metadata from a class.
 * Scans for @Executor, @Context properties and @Tool/@LLMTool methods.
 */
export function extractLLMInfo(cls: ClassDeclaration): ParsedLLMInfo {
  const isLLMEntity = extendsLLMEntity(cls) || !!cls.getDecorator('LLMEntity');
  if (!isLLMEntity) {
    return { isLLMEntity: false, tools: [], triggers: [] };
  }

  let contextProp: string | undefined;
  let executorProp: string | undefined;
  const tools: ParsedLLMTool[] = [];
  const triggers: string[] = [];

  // Scan properties for @Context, @Executor
  for (const prop of cls.getProperties()) {
    if (prop.getDecorator('Context')) contextProp = prop.getName();
    if (prop.getDecorator('Executor')) executorProp = prop.getName();
  }

  // Scan methods for @LLMTool or @Tool
  for (const method of cls.getMethods()) {
    const llmToolDec = method.getDecorator('LLMTool');
    const toolDec = method.getDecorator('Tool');
    if (!llmToolDec && !toolDec) continue;
    if (method.getDecorator('LLMExecutionTrigger')) continue;

    const dec = llmToolDec ?? toolDec!;
    const args = dec.getArguments();
    const optionsText = args[0]?.getText() ?? '{}';
    const description = extractStringProp(optionsText, 'description') ?? method.getName();
    const name = extractStringProp(optionsText, 'name');

    const params = method.getParameters();
    const inputType = params.length > 0
      ? parseType(params[0].getType())
      : { kind: 'object' as const, properties: [] };
    const inputZod = parsedTypeToZod(inputType);

    tools.push({ method: method.getName(), description, name, inputType, inputZod });
  }

  // Scan methods for @LLMExecutionTrigger
  for (const method of cls.getMethods()) {
    if (method.getDecorator('LLMExecutionTrigger')) {
      triggers.push(method.getName());
    }
  }

  return { isLLMEntity, contextProp, executorProp, tools, triggers };
}

// ─── MCP Metadata ───────────────────────────────────────

/**
 * Extract @MCP decorator metadata from a class.
 */
export function extractMCPInfo(cls: ClassDeclaration): ParsedMCPInfo {
  const mcpDec = cls.getDecorator('MCP');
  if (!mcpDec) return { isMCPEntity: false };

  const args = mcpDec.getArguments();
  const transport = args[0]?.getText();

  return { isMCPEntity: true, transport };
}
