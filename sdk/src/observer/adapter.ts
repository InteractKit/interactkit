import type { EventEnvelope } from '../events/types.js';
import type { EntityTree } from '../entity/wrappers/types.js';

export interface ObserverAdapter {
  event(envelope: EventEnvelope): void;
  error(envelope: EventEnvelope, error: Error): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;

  /** Set a state field on an entity. */
  setState(entityId: string, field: string, value: unknown): void;
  /** Get a state field from an entity. */
  getState(entityId: string, field: string): Promise<unknown>;
  /** Call a method on an entity. */
  callMethod(entityId: string, method: string, payload?: unknown): Promise<unknown>;
  /** Get the full entity tree structure. */
  getEntityTree(): Promise<EntityTree>;
}
