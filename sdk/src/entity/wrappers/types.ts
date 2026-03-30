import type { BaseEntity } from '../types.js';

// ─── Entity Tree ────────────────────────────────────────

export interface EntityNodeComponent {
  /** Pre-calculated path ID (e.g. "agent.worker") */
  id: string;
  propertyName: string;
  entityType: string;
  entity?: EntityNode;
}

export interface EntityNode {
  /** Pre-calculated path ID (e.g. "agent", "agent.worker", "agent.worker.cache") */
  id: string;
  type: string;
  className: string;
  infra: { detached?: boolean };
  state: Array<{ name: string; id: string }>;
  refs: Array<{ propertyName: string; targetEntityType: string; id: string }>;
  components: EntityNodeComponent[];
  streams: Array<{ propertyName: string; id: string }>;
  methods: Array<{ methodName: string; eventName: string; id: string; description?: string; inputSchema?: MethodInputSchema; }>;
  hooks: Array<{ methodName: string; hookTypeName: string; runnerExport?: string; inProcess: boolean; id: string }>;
}

export type EntityTree = EntityNode;

// ─── Method input schema (for observer UI form generation) ──

export type FieldType =
  | 'string' | 'number' | 'boolean'
  | { kind: 'array'; element: FieldType }
  | { kind: 'enum'; values: Array<string | number> }
  | { kind: 'object'; fields: MethodInputField[] };

export interface MethodInputField {
  name: string;
  type: FieldType;
  optional: boolean;
}

/** Describes a method's input parameters for UI form generation. */
export interface MethodInputSchema {
  fields: MethodInputField[];
}

// ─── Element descriptor ─────────────────────────────────

export interface ElementDescriptor {
  entity: BaseEntity;
  entityType: string;
  name: string;
  kind: 'state' | 'component' | 'ref' | 'stream' | 'method' | 'hook';
  metadata?: unknown;
}
