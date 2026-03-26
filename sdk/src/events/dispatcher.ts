import type { BaseEntity } from '../entity/types.js';
import type { DatabaseAdapter } from '../database/adapter.js';
import type { EventEnvelope } from './types.js';
import { CURRENT_ENVELOPE } from '../entity/context.js';

interface EntityEntry {
  instance: BaseEntity;
  entityType: string;
  methods: Map<string, Function>;
  database?: DatabaseAdapter;
  stateKeys?: string[];
}

/**
 * Routes incoming EventEnvelopes to the correct entity method.
 * Optionally validates payloads against the generated registry.
 */
export class EventDispatcher {
  private entities = new Map<string, EntityEntry>();

  constructor(private registry?: any) {}

  /**
   * Register an entity instance with its callable methods.
   */
  register(
    entityId: string,
    instance: BaseEntity,
    entityType: string,
    methods: Map<string, Function>,
    database?: DatabaseAdapter,
    stateKeys?: string[],
  ): void {
    this.entities.set(entityId, { instance, entityType, methods, database, stateKeys });
  }

  /**
   * Add a method to an already-registered entity (used by MCP to add discovered tools at boot).
   */
  addMethod(entityId: string, methodKey: string, method: Function): void {
    const entry = this.entities.get(entityId);
    if (!entry) throw new Error(`Cannot add method: entity not found: ${entityId}`);
    entry.methods.set(methodKey, method);
  }

  /**
   * Dispatch an event envelope to the target entity's method.
   */
  async dispatch(envelope: EventEnvelope): Promise<unknown> {
    const entry = this.entities.get(envelope.target);
    if (!entry) throw new Error(`Entity not found: ${envelope.target}`);

    const method = entry.methods.get(envelope.type);
    if (!method) throw new Error(`Method not found: ${envelope.type} on ${envelope.target}`);

    // Validate input if registry available
    let payload = envelope.payload;
    if (this.registry) {
      const entityReg = this.registry.entities?.[entry.entityType];
      const methodReg = entityReg?.methods?.[envelope.type];
      if (methodReg?.input?.safeParse) {
        // Treat undefined payload as empty object for methods with no args
        const input = payload ?? {};
        const parsed = methodReg.input.safeParse(input);
        if (!parsed.success) {
          throw new Error(`Validation failed for ${envelope.type}: ${parsed.error.message}`);
        }
        payload = parsed.data;
      }
    }

    // Attach envelope to input so EntityContext can read it
    if (payload && typeof payload === 'object') {
      (payload as any)[CURRENT_ENVELOPE] = envelope;
    }

    // Call the method
    const result = await method.call(entry.instance, payload);

    // Auto-persist state after method call
    if (entry.database && entry.stateKeys) {
      const state: Record<string, unknown> = {};
      for (const key of entry.stateKeys) {
        state[key] = (entry.instance as any)[key];
      }
      await entry.database.set(envelope.target, state);
    }

    return result;
  }
}
