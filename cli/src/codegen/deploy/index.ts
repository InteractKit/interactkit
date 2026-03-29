import type { EntityInfo } from '@/codegen/types.js';

export interface DeploymentUnit {
  /** Unique name for this deployment unit */
  name: string;
  /** Entities that MUST run in this unit (co-located) */
  entities: string[];
  /** Why these entities are grouped together */
  reason: string;
  /** Can this unit be horizontally scaled (multiple replicas)? */
  scalable: boolean;
}

export interface DeploymentPlan {
  /** Total entities in the system */
  totalEntities: number;
  /** Deployment units — groups of co-located entities */
  units: DeploymentUnit[];
  /** Connections between units (cross-unit communication) */
  connections: Array<{
    from: string;
    to: string;
    methods: string[];
  }>;
}

/**
 * Analyze entity infra config and generate a deployment plan.
 *
 * Rules:
 * - Non-detached entities MUST share a process with their parent/siblings
 * - Detached entities CAN be separated into their own deployment unit
 * - EntityStream requires co-location (in-memory data flow)
 */
export function generateDeploymentPlan(entities: EntityInfo[]): DeploymentPlan {
  const entityMap = new Map(entities.map(e => [e.type, e]));

  // Build parent → children map
  const parentOf = new Map<string, string>();
  for (const entity of entities) {
    for (const comp of entity.components) {
      parentOf.set(comp.entityType, entity.type);
    }
  }

  // Group entities into co-location clusters
  // Non-detached entities must be with their parent
  // Streams require co-location (unless entity is detached)
  const clusters = new Map<string, Set<string>>(); // clusterName → entityTypes
  const entityCluster = new Map<string, string>();  // entityType → clusterName

  function assignCluster(entityType: string, clusterName: string) {
    if (entityCluster.has(entityType)) {
      const existing = entityCluster.get(entityType)!;
      if (existing !== clusterName) {
        const existingSet = clusters.get(existing)!;
        const newSet = clusters.get(clusterName) ?? new Set();
        for (const e of newSet) {
          existingSet.add(e);
          entityCluster.set(e, existing);
        }
        clusters.delete(clusterName);
        return existing;
      }
    }
    if (!clusters.has(clusterName)) clusters.set(clusterName, new Set());
    clusters.get(clusterName)!.add(entityType);
    entityCluster.set(entityType, clusterName);
    return clusterName;
  }

  // First pass: group non-detached entities with their parent
  for (const entity of entities) {
    const parent = parentOf.get(entity.type);
    if (!entity.infra.detached) {
      const clusterName = parent ? `unit-${parent}` : `unit-${entity.type}`;
      assignCluster(entity.type, clusterName);
      if (parent) assignCluster(parent, clusterName);
    }
  }

  // Second pass: non-detached entities with streams must be co-located with parent
  for (const entity of entities) {
    if (entity.streams.length > 0 && !entity.infra.detached) {
      const parent = parentOf.get(entity.type);
      if (parent) {
        const clusterName = entityCluster.get(parent) ?? `unit-${parent}`;
        assignCluster(entity.type, clusterName);
        assignCluster(parent, clusterName);
      }
    }
  }

  // Third pass: assign remaining (detached) entities to their own cluster
  for (const entity of entities) {
    if (!entityCluster.has(entity.type)) {
      assignCluster(entity.type, `unit-${entity.type}`);
    }
  }

  // Build deployment units
  const units: DeploymentUnit[] = [];
  for (const [clusterName, entityTypes] of clusters) {
    const types = [...entityTypes];
    const allLocal = types.every(t => !entityMap.get(t)?.infra.detached);

    const reasons: string[] = [];
    if (allLocal) reasons.push('co-located (not detached)');
    if (reasons.length === 0) reasons.push('default grouping');

    units.push({
      name: clusterName,
      entities: types.sort(),
      reason: reasons.join('; '),
      scalable: !allLocal,
    });
  }

  // Build connections between units
  const connections: DeploymentPlan['connections'] = [];
  for (const entity of entities) {
    const myCluster = entityCluster.get(entity.type)!;

    for (const comp of entity.components) {
      const childCluster = entityCluster.get(comp.entityType);
      if (childCluster && childCluster !== myCluster) {
        const childEntity = entityMap.get(comp.entityType);
        const methods = childEntity?.methods.map(m => m.eventName) ?? [];
        connections.push({
          from: myCluster,
          to: childCluster,
          methods,
        });
      }
    }
  }

  return {
    totalEntities: entities.length,
    units: units.sort((a, b) => a.name.localeCompare(b.name)),
    connections,
  };
}
