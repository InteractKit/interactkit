import type { ObserverAdapter } from "./adapter.js";
import type { EventEnvelope } from "../events/types.js";
import type { EntityTree } from "../entity/wrappers/types.js";

/**
 * Combines multiple observers into one.
 * Fans out event/error to all, delegates control plane to all
 * (first successful response wins for get/call).
 */
export class CompositeObserver implements ObserverAdapter {
  constructor(private readonly observers: ObserverAdapter[]) {}

  event(envelope: EventEnvelope): void {
    for (const o of this.observers) o.event(envelope);
  }

  error(envelope: EventEnvelope, error: Error): void {
    for (const o of this.observers) o.error(envelope, error);
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    for (const o of this.observers) o.on(event, handler);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    for (const o of this.observers) o.off(event, handler);
  }

  setState(entityId: string, field: string, value: unknown): void {
    // Any observer can set state — fan out to all
    for (const o of this.observers) o.setState(entityId, field, value);
  }

  getState(entityId: string, field: string): Promise<unknown> {
    // First observer handles it
    return this.observers[0].getState(entityId, field);
  }

  callMethod(entityId: string, method: string, payload?: unknown): Promise<unknown> {
    return this.observers[0].callMethod(entityId, method, payload);
  }

  getEntityTree(): Promise<EntityTree> {
    return this.observers[0].getEntityTree();
  }
}
