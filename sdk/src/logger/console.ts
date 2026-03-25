import type { LogAdapter } from './adapter.js';
import type { EventEnvelope } from '../events/types.js';

/**
 * Simple console-based logger. Logs all events and errors to stdout/stderr.
 */
export class ConsoleLogAdapter implements LogAdapter {
  event(envelope: EventEnvelope): void {
    console.log(`[event] ${envelope.type} ${envelope.source} → ${envelope.target}`, envelope.payload ?? '');
  }

  error(envelope: EventEnvelope, error: Error): void {
    console.error(`[error] ${envelope.type} ${envelope.source} → ${envelope.target}:`, error.message);
  }
}
