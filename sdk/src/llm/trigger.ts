/**
 * Parameters auto-populated by the runtime when an @LLMExecutionTrigger method is called.
 * The runtime resolves caller info from the entity linkage (event bus source).
 */
export interface LLMExecutionTriggerParams {
  /** The user/caller message to process */
  message: string;

  /** Who triggered this — auto-populated from event bus source entity */
  caller: {
    /** Entity ID of the caller (e.g. "person:abc123") */
    entityId: string;
    /** Entity type of the caller (e.g. "person") */
    entityType: string;
  };

  /** Entity lineage — the path from root to this entity */
  lineage: Array<{
    entityId: string;
    entityType: string;
  }>;

  /** Relationship between caller and this entity */
  relationship: 'parent' | 'child' | 'sibling' | 'self' | 'external';

  /** Optional metadata the caller can attach */
  metadata?: Record<string, unknown>;
}
