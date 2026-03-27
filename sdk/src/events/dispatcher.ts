import { randomUUID } from 'node:crypto';
import type { BaseEntity } from '../entity/types.js';
import type { EventEnvelope } from './types.js';
import { CURRENT_ENVELOPE } from '../entity/context.js';

interface EntityEntry {
  instance: BaseEntity;
  entityType: string;
  methods: Map<string, Function>;
}

/**
 * Routes incoming EventEnvelopes to the correct entity method.
 * Optionally validates payloads against the generated registry.
 *
 * State persistence is handled by reactive state proxies in the runtime,
 * not by the dispatcher.
 */
export class EventDispatcher {
  private entities = new Map<string, EntityEntry>();
  readonly instanceId: string;

  constructor(private registry?: any) {
    this.instanceId = randomUUID().slice(0, 8);
  }

  register(
    entityId: string,
    instance: BaseEntity,
    entityType: string,
    methods: Map<string, Function>,
  ): void {
    this.entities.set(entityId, { instance, entityType, methods });
  }

  addMethod(entityId: string, methodKey: string, method: Function): void {
    const entry = this.entities.get(entityId);
    if (!entry) throw new Error(`Cannot add method: entity not found: ${entityId}`);
    entry.methods.set(methodKey, method);
  }

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
        const input = payload ?? {};
        const parsed = methodReg.input.safeParse(input);
        if (!parsed.success) {
          throw new Error(`Validation failed for ${envelope.type}: ${parsed.error.message}`);
        }
        payload = parsed.data;
      }
    }

    if (payload && typeof payload === 'object') {
      (payload as any)[CURRENT_ENVELOPE] = envelope;
    }

    return await method.call(entry.instance, payload);
  }
}
