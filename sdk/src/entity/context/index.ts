import type { EventEnvelope } from '../../events/types.js';

/** Symbol used to store the current event envelope on method input objects */
export const CURRENT_ENVELOPE = Symbol('entity:currentEnvelope');

/** Caller metadata resolved from the current event envelope */
export interface CallerInfo {
  /** Entity ID of the caller (e.g. "agent:abc123") */
  entityId: string;
  /** Entity type of the caller, derived from the ID segment (e.g. "agent") */
  entityType: string;
}

/**
 * Runtime utility for accessing event metadata from within entity methods.
 *
 * Usage:
 * ```typescript
 * async someMethod(input: { text: string }) {
 *   const caller = EntityContextManager.caller(input);
 *   console.log(`Called by ${caller.entityId}`);
 * }
 * ```
 */
export const EntityContextManager = {
  /**
   * Get the caller (source entity) of the current method invocation.
   * Pass the method's input parameter — the runtime attaches metadata to it.
   * Returns undefined if called outside an event-dispatched context.
   */
  caller(input: object): CallerInfo | undefined {
    const envelope = (input as any)[CURRENT_ENVELOPE] as EventEnvelope | undefined;
    if (!envelope?.source) return undefined;
    const entityType = envelope.source.split('/').pop()?.split(':')[0] ?? '';
    return { entityId: envelope.source, entityType };
  },

  /**
   * Get the full lineage (parent chain) of the caller from its hierarchical ID.
   * e.g. "agent:abc/brain:def" → [{ entityId: "agent:abc", entityType: "agent" }, { entityId: "agent:abc/brain:def", entityType: "brain" }]
   */
  lineage(input: object): CallerInfo[] {
    const envelope = (input as any)[CURRENT_ENVELOPE] as EventEnvelope | undefined;
    if (!envelope?.source) return [];
    const segments = envelope.source.split('/');
    const result: CallerInfo[] = [];
    let path = '';
    for (const seg of segments) {
      path = path ? `${path}/${seg}` : seg;
      const entityType = seg.split(':')[0] ?? '';
      result.push({ entityId: path, entityType });
    }
    return result;
  },

  /**
   * Get the raw event envelope of the current method invocation.
   */
  envelope(input: object): EventEnvelope | undefined {
    return (input as any)[CURRENT_ENVELOPE] as EventEnvelope | undefined;
  },
};
