import type { EntityInfo } from '../types.js';

export interface DeploymentUnit {
  /** Unique name for this deployment unit */
  name: string;
  /** Entities that MUST run in this unit (co-located) */
  entities: string[];
  /** Why these entities are grouped together */
  reason: string;
  /** Can this unit be horizontally scaled (multiple replicas)? */
  scalable: boolean;
  /** Pubsub adapter used between units */
  busAdapter: string;
  /** Database adapter (if any) */
  databaseAdapter?: string;
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
    adapter: string;
    methods: string[];
  }>;
}

/**
 * Analyze entity infra config and generate a deployment plan.
 *
 * Rules:
 * - Entities using InProcessBusAdapter MUST share a process with their parent/siblings
 * - Entities using RedisPubSubAdapter (or any distributed adapter) CAN be separated
 * - EntityStream requires co-location (in-memory data flow)
 * - EntityRef siblings that both use InProcess must be co-located
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

  // Determine resolved pubsub per entity (own or inherited from parent)
  const resolvedPubsub = new Map<string, string>();
  function resolvePubsub(entityType: string): string {
    if (resolvedPubsub.has(entityType)) return resolvedPubsub.get(entityType)!;
    const entity = entityMap.get(entityType);
    if (entity?.infra.pubsub) {
      resolvedPubsub.set(entityType, entity.infra.pubsub);
      return entity.infra.pubsub;
    }
    const parent = parentOf.get(entityType);
    if (parent) {
      const inherited = resolvePubsub(parent);
      resolvedPubsub.set(entityType, inherited);
      return inherited;
    }
    resolvedPubsub.set(entityType, 'InProcessBusAdapter');
    return 'InProcessBusAdapter';
  }

  for (const entity of entities) {
    resolvePubsub(entity.type);
  }

  // Group entities into co-location clusters
  // InProcess entities must be with their parent
  // Streams require co-location
  const clusters = new Map<string, Set<string>>(); // clusterName → entityTypes
  const entityCluster = new Map<string, string>();  // entityType → clusterName

  function assignCluster(entityType: string, clusterName: string) {
    if (entityCluster.has(entityType)) {
      // Merge clusters if already assigned to a different one
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

  // First pass: group InProcess entities with their parent
  for (const entity of entities) {
    const pubsub = resolvedPubsub.get(entity.type)!;
    const parent = parentOf.get(entity.type);

    if (pubsub === 'InProcessBusAdapter' || !pubsub.includes('Redis')) {
      // Must be co-located with parent
      const clusterName = parent ? `unit-${parent}` : `unit-${entity.type}`;
      assignCluster(entity.type, clusterName);
      if (parent) assignCluster(parent, clusterName);
    }
  }

  // Second pass: entities with streams must be co-located with parent
  for (const entity of entities) {
    if (entity.streams.length > 0) {
      const parent = parentOf.get(entity.type);
      if (parent) {
        const clusterName = entityCluster.get(parent) ?? `unit-${parent}`;
        assignCluster(entity.type, clusterName);
        assignCluster(parent, clusterName);
      }
    }
  }

  // Third pass: assign remaining entities to their own cluster
  for (const entity of entities) {
    if (!entityCluster.has(entity.type)) {
      assignCluster(entity.type, `unit-${entity.type}`);
    }
  }

  // Build deployment units
  const units: DeploymentUnit[] = [];
  for (const [clusterName, entityTypes] of clusters) {
    const types = [...entityTypes];
    const hasInProcess = types.some(t => {
      const ps = resolvedPubsub.get(t);
      return !ps || ps === 'InProcessBusAdapter' || !ps.includes('Redis');
    });
    const hasStreams = types.some(t => {
      const e = entityMap.get(t);
      return e && e.streams.length > 0;
    });

    const reasons: string[] = [];
    if (hasInProcess) reasons.push('InProcessBusAdapter requires co-location');
    if (hasStreams) reasons.push('EntityStream requires co-location');
    if (reasons.length === 0) reasons.push('default grouping');

    // Determine bus adapter for cross-unit communication
    const rootEntity = types.find(t => !parentOf.has(t)) ?? types[0];
    const busAdapter = resolvedPubsub.get(rootEntity) ?? 'InProcessBusAdapter';

    // Database
    const dbAdapters = types
      .map(t => entityMap.get(t)?.infra.database)
      .filter(Boolean);
    const databaseAdapter = dbAdapters[0];

    units.push({
      name: clusterName,
      entities: types.sort(),
      reason: reasons.join('; '),
      scalable: !hasInProcess && !hasStreams,
      busAdapter,
      databaseAdapter,
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
          adapter: resolvedPubsub.get(comp.entityType) ?? 'RedisPubSubAdapter',
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
