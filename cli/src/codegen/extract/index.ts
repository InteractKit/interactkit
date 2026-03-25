import { Project } from 'ts-morph';
import { typeToZod } from '../mappers/type-mapper.js';
import { extractValidators } from '../mappers/validator-mapper.js';
import { classifyProperty } from './properties.js';
import { getHookMethodNames, extractHook } from './hooks.js';
import { extractMethod } from './methods.js';
import { extractLLMInfo } from './llm.js';
import { validateEntities } from '../validate/index.js';
import { extractStringProp, extractIdentProp } from '../utils.js';
import type { EntityInfo } from '../types.js';

// Re-export types for consumers
export type { EntityInfo, LLMInfo, PropertyInfo, ComponentInfo, StreamInfo, RefInfo, HookInfo, MethodInfo, ConfigurableInfo } from '../types.js';

/**
 * Extract all entity metadata from the project's source files.
 */
export function extractEntities(project: Project): EntityInfo[] {
  // Pass 1: find all @Entity classes and build className → entityType map
  const entityClasses: Array<{ cls: any; type: string; persona: boolean; infra: { pubsub?: string; database?: string; logger?: string } }> = [];
  const classToEntityType = new Map<string, string>();

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const entityDec = cls.getDecorator('Entity');
      if (!entityDec) continue;

      const args = entityDec.getArguments();
      if (args.length === 0) continue;

      const optionsText = args[0].getText();
      const type = extractStringProp(optionsText, 'type');
      const persona = optionsText.includes('persona: true') || optionsText.includes('persona:true');

      if (!type) continue;

      // Extract infra adapter names
      const pubsub = extractIdentProp(optionsText, 'pubsub');
      const database = extractIdentProp(optionsText, 'database');
      const logger = extractIdentProp(optionsText, 'logger');

      entityClasses.push({ cls, type, persona, infra: { pubsub, database, logger } });
      classToEntityType.set(cls.getName() ?? '', type);
    }
  }

  // Pass 2: extract full metadata for each entity
  const entities: EntityInfo[] = [];

  for (const { cls, type, persona, infra } of entityClasses) {
    const sourceFile = cls.getSourceFile().getFilePath();
    const hookMethodNames = getHookMethodNames(cls);

    const state: EntityInfo['state'] = [];
    const components: EntityInfo['components'] = [];
    const streams: EntityInfo['streams'] = [];
    const refs: EntityInfo['refs'] = [];
    const configurables: EntityInfo['configurables'] = [];

    // Classify properties
    for (const prop of cls.getProperties()) {
      const name = prop.getName();
      if (name === 'id') continue;

      const classification = classifyProperty(prop, classToEntityType);

      switch (classification.kind) {
        case 'ref':
          refs.push({ propertyName: name, targetEntityType: classification.entityType });
          break;
        case 'stream':
          streams.push({ propertyName: name, payloadZod: classification.payloadZod });
          break;
        case 'component':
          components.push({ propertyName: name, entityType: classification.entityType });
          break;
        case 'state': {
          const { zodRefinements, fieldMeta } = extractValidators(prop);
          const baseZod = typeToZod(prop.getType());
          const zodCode = baseZod + zodRefinements;
          const optional = prop.hasQuestionToken();

          state.push({
            name,
            zodCode: optional ? `${zodCode}.optional()` : zodCode,
            optional,
            fieldMeta,
          });

          const configDec = prop.getDecorator('Configurable');
          if (configDec) {
            const configArgs = configDec.getArguments();
            const configText = configArgs[0]?.getText() ?? '{}';
            configurables.push({
              key: name,
              label: extractStringProp(configText, 'label') ?? name,
              group: extractStringProp(configText, 'group'),
              tsType: prop.getType().getText(),
              zodCode,
            });
          }
          break;
        }
      }
    }

    // Extract hooks
    const hooks: EntityInfo['hooks'] = [];
    for (const method of cls.getMethods()) {
      if (!hookMethodNames.has(method.getName())) continue;
      const hookInfo = extractHook(method, project);
      if (hookInfo) hooks.push(hookInfo);
    }

    // Extract public async methods (non-hook)
    const methods: EntityInfo['methods'] = [];
    for (const method of cls.getMethods()) {
      if (hookMethodNames.has(method.getName())) continue;
      if (!method.isAsync()) continue;
      if (method.getScope() === 'private' || method.getScope() === 'protected') continue;
      methods.push(extractMethod(method, type));
    }

    // Extract LLM metadata
    const llm = extractLLMInfo(cls, methods);

    entities.push({
      type,
      persona,
      className: cls.getName() ?? 'Anonymous',
      sourceFile,
      sourcePackage: undefined,
      infra,
      state,
      components,
      streams,
      refs,
      hooks,
      methods,
      configurables,
      llm,
    });
  }

  // Validate
  const errors = validateEntities(entities);
  if (errors.length > 0) {
    console.error('\n✗ Build validation failed:\n');
    for (const err of errors) {
      console.error(`  ${err}`);
    }
    console.error('');
    process.exit(1);
  }

  return entities;
}
