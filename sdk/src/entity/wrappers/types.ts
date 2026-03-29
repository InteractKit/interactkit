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
  methods: Array<{ methodName: string; eventName: string; id: string }>;
  hooks: Array<{ methodName: string; hookTypeName: string; runnerExport?: string; inProcess: boolean; id: string }>;
}

export type EntityTree = EntityNode;

// ─── Element descriptor ─────────────────────────────────

export interface ElementDescriptor {
  entity: BaseEntity;
  entityType: string;
  name: string;
  kind: 'state' | 'component' | 'ref' | 'stream' | 'method' | 'hook';
  metadata?: unknown;
}
