import type { EntityInfo } from '../types.js';

/** Validate all entities and return errors. Empty array = all good. */
export function validateEntities(entities: EntityInfo[]): string[] {
  const errors: string[] = [];
  const entityTypes = new Set(entities.map(e => e.type));

  for (const entity of entities) {
    const loc = `${entity.className} (${entity.type})`;

    // ─── Constructor override ─────────────────────────
    if (entity.hasConstructor) {
      errors.push(`${loc}: entities must not define a constructor — BaseEntity's constructor is framework-managed. Use @Hook(Init.Runner()) for initialization logic`);
    }

    // ─── State properties ─────────────────────────────
    for (const prop of entity.state) {
      if (!prop.hasState && !prop.hasSystemPrompt && !prop.hasExecutor) {
        errors.push(`${loc}: state property "${prop.name}" requires @State({ description: '...' })`);
      }
      if (!prop.isPrivate) {
        errors.push(`${loc}: state property "${prop.name}" must be private — only @Tool methods can be public`);
      }
    }

    // ─── Component references ─────────────────────────
    for (const comp of entity.components) {
      if (!entityTypes.has(comp.entityType)) {
        errors.push(`${loc}: @Component "${comp.propertyName}" references unknown entity type "${comp.entityType}"`);
      }
      if (!comp.isPrivate) {
        errors.push(`${loc}: component "${comp.propertyName}" must be private — parent entities should not reach through children (use a method to expose functionality)`);
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
        if (!ref.isPrivate) {
          errors.push(`${loc}: ref "${ref.propertyName}" must be private — refs are internal wiring, not part of the entity's public API`);
        }
      }
    }

    // ─── Public methods require @Tool ─────────────────
    for (const method of entity.methods) {
      if (!method.hasTool) {
        errors.push(`${loc}: public method "${method.methodName}" requires @Tool({ description: '...' }) — all public methods must be decorated with @Tool`);
      }
    }

    // ─── Hook validation ──────────────────────────────
    for (const hook of entity.hooks) {
      if (!hook.runnerExport) {
        errors.push(`${loc}: @Hook "${hook.methodName}" requires a runner — e.g. @Hook(Init.Runner())`);
      }
      if (!hook.hookTypeName || hook.hookTypeName === '__type') {
        errors.push(`${loc}: @Hook "${hook.methodName}" has no typed parameter — e.g. (input: Init.Input)`);
      }
    }

    // ─── LLM validation ──────────────────────────────
    if (entity.llm.isLLMEntity) {
      // Required decorators
      if (!entity.llm.executorProp) {
        errors.push(`${loc}: LLMEntity requires an @Executor() property with a LangChain BaseChatModel instance`);
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

      // @LLMExecutionTrigger validation — triggers are extracted separately from methods, no need to cross-check

      if (entity.llm.triggers.length > 0 && !entity.llm.executorProp) {
        errors.push(`${loc}: @LLMExecutionTrigger requires an @Executor() property`);
      }

    }

    // ─── MCP validation ──────────────────────────────
    if (entity.mcp.isMCPEntity) {
      if (!entity.mcp.transport) {
        errors.push(`${loc}: @MCP requires a transport config (e.g. @MCP({ transport: { type: 'http', url: '...' } }))`);
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
      if (entity.llm.tools.length > 0) {
        errors.push(`${loc}: has @LLMTool() but missing @LLMEntity decorator`);
      }
    }
  }

  return errors;
}
