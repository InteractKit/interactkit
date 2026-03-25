export interface EventEnvelope {
  id: string;
  source: string;
  target: string;
  type: string;
  payload: unknown;
  timestamp: number;
  correlationId?: string;
  error?: { message: string; stack?: string };
}
