import type { HookRunner } from '../runner.js';
import type { EventInput } from '../types.js';

/**
 * EventRunner — listens for named events on the event bus.
 * Config: {} (event name comes from the entity's method signature)
 *
 * This runner is wired by the runtime to receive EventInput payloads
 * from the bus when other entities emit events.
 */
export class EventRunner implements HookRunner<EventInput> {
  private emitFn?: (data: EventInput) => void;

  async start(emit: (data: EventInput) => void, _config: Record<string, unknown>): Promise<void> {
    this.emitFn = emit;
  }

  /** Called by the runtime when an event is received. */
  fire(eventName: string, payload: unknown, source: string): void {
    this.emitFn?.({ eventName, payload, source });
  }

  async stop(): Promise<void> {
    this.emitFn = undefined;
  }
}
