import { boot } from '@interactkit/sdk';
import type { EntityClass, RuntimeContext, BootOptions } from '@interactkit/sdk';

export interface BootTestOptions extends BootOptions {
  /**
   * Mock executors for LLM entities, keyed by entity type.
   * Use mockLLM() to create scripted executors.
   */
  executors?: Record<string, any>;
}

/**
 * Boot an entity tree for testing. Same as boot() but with:
 * - Deterministic IDs (counter-based, not random)
 * - Optional mock executors for LLM entities
 *
 * Returns the same RuntimeContext as boot().
 */
export async function bootTest(
  RootEntityClass: EntityClass,
  options?: BootTestOptions,
): Promise<RuntimeContext> {
  let counter = 0;
  const idGenerator = () => String(++counter).padStart(4, '0');

  const ctx = await boot(RootEntityClass, {
    ...options,
    idGenerator,
  });

  // Swap executors on LLM entities if provided
  if (options?.executors) {
    for (const [, entityInst] of ctx.entities) {
      const entityType = entityInst.type;
      if (options.executors[entityType]) {
        const executorProp = findExecutorProp(entityInst.entity);
        if (executorProp) {
          (entityInst.entity as any)[executorProp] = options.executors[entityType];
        }
      }
    }
  }

  return ctx;
}

/** Find the @Executor property name on an entity instance via metadata */
function findExecutorProp(entity: any): string | undefined {
  const LLM_EXECUTOR_KEY = Symbol.for('llm:executor');
  return Reflect.getOwnMetadata(LLM_EXECUTOR_KEY, entity.constructor);
}
