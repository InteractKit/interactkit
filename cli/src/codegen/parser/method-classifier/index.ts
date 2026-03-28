import { MethodDeclaration } from 'ts-morph';

export type MethodClassification =
  | { kind: 'hook' }
  | { kind: 'trigger' }
  | { kind: 'public-method' }
  | { kind: 'skip'; reason: 'private' | 'protected' | 'sync' };

/**
 * Classify a method into one of four categories:
 * - hook: has @Hook decorator
 * - trigger: has @LLMExecutionTrigger decorator
 * - public-method: async + public (not hook or trigger)
 * - skip: private, protected, or synchronous
 */
export function classifyMethod(
  method: MethodDeclaration,
  hookMethodNames: Set<string>,
): MethodClassification {
  if (hookMethodNames.has(method.getName())) {
    return { kind: 'hook' };
  }

  if (method.getDecorator('LLMExecutionTrigger')) {
    return { kind: 'trigger' };
  }

  if (!method.isAsync()) {
    return { kind: 'skip', reason: 'sync' };
  }

  const scope = method.getScope();
  if (scope === 'private') return { kind: 'skip', reason: 'private' };
  if (scope === 'protected') return { kind: 'skip', reason: 'protected' };

  return { kind: 'public-method' };
}
