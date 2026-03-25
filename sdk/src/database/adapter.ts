export interface DatabaseAdapter {
  get(entityId: string): Promise<Record<string, unknown> | null>;
  set(entityId: string, state: Record<string, unknown>): Promise<void>;
  delete(entityId: string): Promise<void>;
}
