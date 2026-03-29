import type { EventEnvelope } from '../events/types.js';

export interface ObserverAdapter {
  event(envelope: EventEnvelope): void;
  error(envelope: EventEnvelope, error: Error): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}
