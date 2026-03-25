import type { EventEnvelope } from '../events/types.js';

export interface LogAdapter {
  event(envelope: EventEnvelope): void;
  error(envelope: EventEnvelope, error: Error): void;
}
