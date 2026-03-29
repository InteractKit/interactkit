import { BaseObserver } from './base.js';
import type { EventEnvelope } from '../events/types.js';

/**
 * Simple console-based observer. Logs all events and errors to stdout/stderr.
 */
export class ConsoleObserver extends BaseObserver {
  event(envelope: EventEnvelope): void {
    console.log(`[event] ${envelope.type} ${envelope.source} → ${envelope.target}`, envelope.payload ?? '');
    this.emit('event', envelope);
  }

  error(envelope: EventEnvelope, error: Error): void {
    console.error(`[error] ${envelope.type} ${envelope.source} → ${envelope.target}:`, error.message);
    this.emit('error', envelope, error);
  }
}
