import type { EntityInfo } from '../types.js';

/** Validate all entities and return errors. Empty array = all good. */
export function validateEntities(entities: EntityInfo[]): string[] {
  const errors: string[] = [];
  const entityTypes = new Set(entities.map(e => e.type));

  for (const entity of entities) {
    const loc = `${entity.className} (${entity.type})`;

    // ─── Component references ─────────────────────────
    for (const comp of entity.components) {
      if (!entityTypes.has(comp.entityType)) {
        errors.push(`${loc}: @Component "${comp.propertyName}" references unknown entity type "${comp.entityType}"`);
      }
    }

    // ─── Ref targets exist as siblings ────────────────
    if (entity.refs.length > 0) {
      const parents = entities.filter(e => e.components.some(c => c.entityType === entity.type));
      for (const ref of entity.refs) {
        const refReachable = parents.some(p =>
          p.components.some(c => c.entityType === ref.targetEntityType)
        );
        if (!refReachable) {
          errors.push(`${loc}: @Ref "${ref.propertyName}" targets "${ref.targetEntityType}" which is not a sibling`);
        }
      }
    }

    // ─── Hook parameters ─────────────────────────────
    for (const hook of entity.hooks) {
      if (!hook.hookTypeName || hook.hookTypeName === '__type') {
        errors.push(`${loc}: @Hook() "${hook.methodName}" has no typed parameter`);
      }
    }

    // ─── LLM validation ──────────────────────────────
    if (entity.llm.isLLMEntity) {
      // Required decorators
      if (!entity.llm.executorProp) {
        errors.push(`${loc}: @LLMEntity requires an @Executor() property with a LangChain BaseChatModel instance`);
      }

      if (!entity.llm.contextProp) {
        errors.push(`${loc}: @LLMEntity requires a @Context() property`);
      }

      if (entity.llm.tools.length === 0) {
        errors.push(`${loc}: @LLMEntity has no @LLMTool() methods — the LLM needs tools to be useful`);
      }

      // @LLMTool validation
      for (const tool of entity.llm.tools) {
        const methodExists = entity.methods.some(m => m.eventName === `${entity.type}.${tool.method}`);
        if (!methodExists) {
          errors.push(`${loc}: @LLMTool "${tool.method}" must be a public async method`);
        }
        if (!tool.description) {
          errors.push(`${loc}: @LLMTool "${tool.method}" requires a description`);
        }
      }

      // @LLMVisible validation
      for (const visible of entity.llm.visibleState) {
        const stateExists = entity.state.some(s => s.name === visible);
        if (!stateExists) {
          errors.push(`${loc}: @LLMVisible "${visible}" is not a state property`);
        }
      }

      // @LLMExecutionTrigger validation
      for (const trigger of entity.llm.triggers) {
        const methodExists = entity.methods.some(m => m.eventName === `${entity.type}.${trigger}`);
        if (!methodExists) {
          errors.push(`${loc}: @LLMExecutionTrigger "${trigger}" must be a public async method`);
        }
      }

      if (entity.llm.triggers.length > 0 && !entity.llm.executorProp) {
        errors.push(`${loc}: @LLMExecutionTrigger requires an @Executor() property`);
      }

      if (entity.llm.triggers.length > 0 && !entity.llm.contextProp) {
        errors.push(`${loc}: @LLMExecutionTrigger requires a @Context() property`);
      }

      if (entity.llm.triggers.length > 0 && entity.llm.tools.length === 0) {
        errors.push(`${loc}: @LLMExecutionTrigger has no @LLMTool() methods to call`);
      }
    }

    // ─── @LLMExecutionTrigger without @LLMEntity ─────
    if (!entity.llm.isLLMEntity && entity.llm.triggers.length > 0) {
      errors.push(`${loc}: has @LLMExecutionTrigger but missing @LLMEntity decorator`);
    }

    // ─── Orphaned LLM decorators ─────────────────────
    if (!entity.llm.isLLMEntity) {
      if (entity.llm.executorProp) {
        errors.push(`${loc}: has @Executor() but missing @LLMEntity decorator`);
      }
      if (entity.llm.contextProp) {
        errors.push(`${loc}: has @Context() but missing @LLMEntity decorator`);
      }
      if (entity.llm.tools.length > 0) {
        errors.push(`${loc}: has @LLMTool() but missing @LLMEntity decorator`);
      }
      if (entity.llm.visibleState.length > 0) {
        errors.push(`${loc}: has @LLMVisible() but missing @LLMEntity decorator`);
      }
    }
  }

  return errors;
}
