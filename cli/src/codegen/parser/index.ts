import { Project, ClassDeclaration } from 'ts-morph';
import { extractEntityMetadata, extractLLMInfo, extractMCPInfo } from './entity-metadata/index.js';
import { classifyVariable } from './variable-classifier/index.js';
import { classifyMethod } from './method-classifier/index.js';
import { parseStateVar } from './state-vars/index.js';
import { parseRef } from './refs/index.js';
import { parseComponent } from './components/index.js';
import { parseStream } from './streams/index.js';
import { parseMethod } from './methods/index.js';
import { getHookMethodNames, parseHook } from './hooks/index.js';
import { parseType, parsedTypeToZod } from '@/codegen/utils/parse-type.js';
import { extractStringProp } from '@/codegen/utils/extract-string-prop.js';
import { validateEntities } from '@/codegen/validator/index.js';
import type { ParsedEntity } from './types/parsed-entity.js';
import type { ParsedStateVar } from './types/parsed-state-var.js';
import type { ParsedRef } from './types/parsed-ref.js';
import type { ParsedComponent } from './types/parsed-component.js';
import type { ParsedStream } from './types/parsed-stream.js';
import type { ParsedMethod } from './types/parsed-method.js';
import type { ParsedHook } from './types/parsed-hook.js';
import type { ParsedConfigurable } from './types/parsed-configurable.js';

// Re-export all types for consumers
export type * from './types/index.js';

/**
 * Main entity parser. Orchestrates sub-parsers to extract
 * rich metadata from all @Entity-decorated classes in a project.
 *
 * Pipeline:
 *   Pass 1 — Discover @Entity classes, build classToEntityType map
 *   Pass 2 — Classify & parse properties and methods via sub-parsers
 *   Pass 3 — Link component references (recursive entity tree)
 *   Pass 4 — Validate
 */
export function extractEntities(project: Project, opts?: { validate?: boolean }): ParsedEntity[] {
  const shouldValidate = opts?.validate ?? true;
  // ─── Pass 1: Entity discovery ───────────────────────
  const discovered: Array<{
    cls: ClassDeclaration;
    type: string;
    className: string;
    sourceFile: string;
    baseClassName?: string;
    persona: boolean;
    infra: { pubsub?: string; database?: string; logger?: string };
    hasConstructor: boolean;
  }> = [];
  const classToEntityType = new Map<string, string>();

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const meta = extractEntityMetadata(cls);
      if (!meta) continue;
      discovered.push({ cls, ...meta });
      classToEntityType.set(meta.className, meta.type);
    }
  }

  // ─── Pass 2: Full metadata extraction ───────────────
  const entities: ParsedEntity[] = [];

  for (const { cls, type, className, sourceFile, baseClassName, persona, infra, hasConstructor } of discovered) {
    const hookMethodNames = getHookMethodNames(cls);

    const state: ParsedStateVar[] = [];
    const components: ParsedComponent[] = [];
    const streams: ParsedStream[] = [];
    const refs: ParsedRef[] = [];
    const configurables: ParsedConfigurable[] = [];

    // ── Classify and parse properties ──
    for (const prop of cls.getProperties()) {
      const name = prop.getName();
      if (name === 'id') continue;

      // Skip LLM-specific properties — handled by extractLLMInfo
      if (prop.getDecorator('Context') || prop.getDecorator('Executor')) continue;

      const classification = classifyVariable(prop, classToEntityType);

      switch (classification.kind) {
        case 'ref':
          refs.push(parseRef(prop, classification));
          break;

        case 'stream':
          streams.push(parseStream(prop, classification));
          break;

        case 'component':
          components.push(parseComponent(prop, classification));
          break;

        case 'state': {
          const stateVar = parseStateVar(prop);
          state.push(stateVar);

          // Check @Configurable
          const configDec = prop.getDecorator('Configurable');
          if (configDec) {
            const configArgs = configDec.getArguments();
            const configText = configArgs[0]?.getText() ?? '{}';
            const propType = parseType(prop.getType());
            // Configurables use the RAW zodCode (without .optional() wrapper)
            const rawZodCode = stateVar.validation ?? parsedTypeToZod(propType);
            configurables.push({
              key: name,
              label: extractStringProp(configText, 'label') ?? name,
              group: extractStringProp(configText, 'group'),
              type: propType,
              tsType: prop.getType().getText(),
              zodCode: rawZodCode,
            });
          }
          break;
        }
      }
    }

    // ── Classify and parse methods ──
    const methods: ParsedMethod[] = [];
    const hooks: ParsedHook[] = [];

    for (const method of cls.getMethods()) {
      const classification = classifyMethod(method, hookMethodNames);

      switch (classification.kind) {
        case 'hook': {
          const hookInfo = parseHook(method);
          if (hookInfo) hooks.push(hookInfo);
          break;
        }
        case 'public-method':
          methods.push(parseMethod(method, type));
          break;
        // 'trigger' and 'skip' are intentionally ignored
      }
    }

    // ── Extract class-level metadata ──
    const llm = extractLLMInfo(cls);
    const mcp = extractMCPInfo(cls);

    entities.push({
      type,
      persona,
      className,
      sourceFile,
      sourcePackage: undefined,
      baseClassName,
      infra,
      state,
      components,
      streams,
      refs,
      hooks,
      methods,
      configurables,
      llm,
      mcp,
      hasConstructor,
    });
  }

  // ─── Pass 3: Link component references (recursive) ──
  const entityMap = new Map(entities.map(e => [e.type, e]));
  for (const entity of entities) {
    for (const comp of entity.components) {
      comp.entity = entityMap.get(comp.entityType);
    }
  }

  // ─── Pass 4: Validate ──────────────────────────────
  if (shouldValidate) {
    const errors = validateEntities(entities);
    if (errors.length > 0) {
      console.error('\n✗ Build validation failed:\n');
      for (const err of errors) {
        console.error(`  ${err}`);
      }
      console.error('');
      process.exit(1);
    }
  }

  return entities;
}
