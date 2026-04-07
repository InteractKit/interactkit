import type { ObserverAdapter } from './adapter.js';
import type { EventEnvelope } from '../events/types.js';
import type { EntityNode } from '../runtime.js';

type EntityTree = EntityNode;

/**
 * Base observer — minimal implementation of ObserverAdapter.
 * Subclasses override event() and error() for logging/monitoring.
 */
export abstract class BaseObserver implements ObserverAdapter {
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  private tree?: EntityTree;

  event(envelope: EventEnvelope): void {}
  error(envelope: EventEnvelope, error: Error): void {}

  setState(_entityId: string, _field: string, _value: unknown): void {}
  async getState(_entityId: string, _field: string): Promise<unknown> { return undefined; }
  async callMethod(_entityId: string, _method: string, _payload?: unknown): Promise<unknown> { return undefined; }
  async getEntityTree(): Promise<EntityTree> { return this.tree!; }

  /** @internal */
  setTree(tree: EntityTree): void { this.tree = tree; }

  on(event: string, handler: (...args: unknown[]) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.handlers.get(event)?.delete(handler);
  }

  protected emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}
