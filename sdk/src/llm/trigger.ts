/**
 * Parameters for @LLMExecutionTrigger methods.
 *
 * For caller/lineage metadata, use EntityContextManager inside the method:
 *   const caller = EntityContextManager.caller(input);
 */
export interface LLMExecutionTriggerParams {
  /** The user/caller message to process */
  message: string;

  /** Optional metadata the caller can attach */
  metadata?: Record<string, unknown>;
}
