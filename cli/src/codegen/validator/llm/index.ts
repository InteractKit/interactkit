import type { SubValidator } from '../types/sub-validator.js';

/** Validate LLM entity configuration and orphaned LLM decorators. */
export const validateLLM: SubValidator = (entity) => {
  const errors: string[] = [];
  const loc = `${entity.className} (${entity.type})`;

  if (entity.llm.isLLMEntity) {
    // Required decorators
    if (!entity.llm.executorProp) {
      errors.push(`${loc}: LLMEntity requires an @Executor() property with a LangChain BaseChatModel instance`);
    }

    if (entity.llm.tools.length === 0) {
      errors.push(`${loc}: @LLMEntity has no @LLMTool() methods — the LLM needs tools to be useful`);
    }

    // @LLMTool must be public async methods
    for (const tool of entity.llm.tools) {
      const methodExists = entity.methods.some(m => m.eventName === `${entity.type}.${tool.method}`);
      if (!methodExists) {
        errors.push(`${loc}: @LLMTool "${tool.method}" must be a public async method`);
      }
      if (!tool.description) {
        errors.push(`${loc}: @LLMTool "${tool.method}" requires a description`);
      }
    }

    // Triggers require executor
    if (entity.llm.triggers.length > 0 && !entity.llm.executorProp) {
      errors.push(`${loc}: @LLMExecutionTrigger requires an @Executor() property`);
    }
  }

  // Orphaned LLM decorators on non-LLM entities
  if (!entity.llm.isLLMEntity) {
    if (entity.llm.triggers.length > 0) {
      errors.push(`${loc}: has @LLMExecutionTrigger but missing @LLMEntity decorator`);
    }
    if (entity.llm.executorProp) {
      errors.push(`${loc}: has @Executor() but missing @LLMEntity decorator`);
    }
    if (entity.llm.tools.length > 0) {
      errors.push(`${loc}: has @LLMTool() but missing @LLMEntity decorator`);
    }
  }

  return errors;
};
