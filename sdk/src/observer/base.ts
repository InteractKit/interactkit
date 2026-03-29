import type { ObserverAdapter } from './adapter.js';
import type { EventEnvelope } from '../events/types.js';

/**
 * Base observer with built-in event emitter.
 * Subclasses implement event() and error() for logging,
 * and can call this.emit() to send events back to subscribers.
 */
export abstract class BaseObserver implements ObserverAdapter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  abstract event(envelope: EventEnvelope): void;
  abstract error(envelope: EventEnvelope, error: Error): void;

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  protected emit(event: string, ...args: unknown[]): void {
    for (const h of this.listeners.get(event) ?? []) h(...args);
  }
}
