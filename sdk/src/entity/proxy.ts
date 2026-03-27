import { randomUUID } from 'node:crypto';
import type { EventBus } from '../events/bus.js';
import type { EventEnvelope } from '../events/types.js';

export function createComponentProxy(
  targetEntityId: string,
  entityType: string,
  sourceEntityId: string,
  bus: EventBus,
): any {
  const target: Record<string | symbol, unknown> = {};
  return new Proxy(
    target,
    {
      get(t, prop) {
        if (prop === 'id') return targetEntityId;
        if (prop === '__entityType') return entityType;
        if (typeof prop === 'symbol') return undefined;

        // Return directly-defined properties (e.g. streams wired after proxy creation)
        if (Object.prototype.hasOwnProperty.call(t, prop)) {
          return t[prop];
        }

        // Return an async function that routes through the event bus
        return async (...args: unknown[]) => {
          const envelope: EventEnvelope = {
            id: randomUUID(),
            source: sourceEntityId,
            target: targetEntityId,
            type: `${entityType}.${String(prop)}`,
            payload: args[0],
            timestamp: Date.now(),
          };
          return bus.request(envelope);
        };
      },
    },
  );
}
