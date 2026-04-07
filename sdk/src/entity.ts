/**
 * Entity — thin runtime object for each node in the entity graph.
 *
 * Handlers receive this with typed state, refs, components, streams, and secrets.
 * Entities communicate through the event bus via call().
 */

import { randomUUID } from 'node:crypto';
import type { EventBus } from './events/bus.js';
import type { DatabaseAdapter } from './database/adapter.js';

export class Entity {
  readonly id: string;
  readonly type: string;
  state: Record<string, any>;
  refs: Record<string, any> = {};
  components: Record<string, any> = {};
  streams: Record<string, { emit(data: any): void }> = {};
  secrets: Record<string, string> = {};

  /** @internal */
  _bus: EventBus;
  /** @internal */
  _db: DatabaseAdapter;

  constructor(
    id: string,
    type: string,
    initialState: Record<string, any>,
    bus: EventBus,
    db: DatabaseAdapter,
  ) {
    this.id = id;
    this.type = type;
    this.state = { ...initialState };
    this._bus = bus;
    this._db = db;
  }

  /**
   * Call another entity's method through the event bus.
   * Use for dynamic routing — prefer typed refs/components for static calls.
   */
  async call(target: string, method: string, input?: any): Promise<any> {
    return this._bus.request({
      id: randomUUID(),
      source: this.id,
      target,
      type: method,
      payload: input,
      timestamp: Date.now(),
    });
  }

  /**
   * Force-persist current state to database.
   * Normally state auto-flushes via reactive proxy — use this for immediate persistence.
   */
  async save(): Promise<void> {
    await this._db.set(this.id, this.state);
  }
}
