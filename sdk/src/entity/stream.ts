export interface EntityStream<T> {
  start(): void;
  data(payload: T): void;
  end(): void;
  emit(payload: T): void;
  on(event: 'start' | 'data' | 'end', handler: (...args: unknown[]) => void): void;
}

type StreamEvent = 'start' | 'data' | 'end';

export class EntityStreamImpl<T> implements EntityStream<T> {
  private handlers = new Map<StreamEvent, Array<(...args: unknown[]) => void>>();
  private started = false;
  private ended = false;

  start(): void {
    if (this.started) throw new Error('Stream already started');
    this.started = true;
    this.invoke('start');
  }

  data(payload: T): void {
    if (!this.started) throw new Error('Stream not started');
    if (this.ended) throw new Error('Stream already ended');
    this.invoke('data', payload);
  }

  end(): void {
    if (this.ended) throw new Error('Stream already ended');
    this.ended = true;
    this.invoke('end');
  }

  emit(payload: T): void {
    // Reset for reuse — emit() is a convenience for one-shot start+data+end
    this.started = false;
    this.ended = false;
    this.start();
    this.data(payload);
    this.end();
  }

  on(event: StreamEvent, handler: (...args: unknown[]) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  private invoke(event: StreamEvent, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}
