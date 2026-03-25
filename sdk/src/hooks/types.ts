export interface CronInput<P extends { expression: string } = { expression: string }> {
  lastRun: Date;
}

export interface EventInput<T = unknown> {
  eventName: string;
  payload: T;
  source: string;
}

export interface InitInput {
  entityId: string;
  firstBoot: boolean;
}

export interface TickInput<P extends { intervalMs: number } = { intervalMs: 60000 }> {
  tick: number;
  elapsed: number;
}

export interface WebSocketInput<P extends { port: number; host?: string }> {
  data: unknown;
  connectionId: string;
}

export interface HttpInput<P extends { port: number; path?: string; method?: string }> {
  body: unknown;
  headers: Record<string, string>;
  params: Record<string, string>;
}
