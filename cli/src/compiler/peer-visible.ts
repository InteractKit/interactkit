/**
 * peerVisible ref inference.
 *
 * For each entity with peerVisible tools, auto-adds refs from all
 * sibling entities (entities sharing the same parent). Only the
 * peerVisible tools are tracked on the inferred ref.
 *
 * Runs after validation, mutates the GraphIR in place.
 */

import type { GraphIR, EntityIR, RefIR } from './ir.js';

export function inferPeerVisibleRefs(graph: GraphIR): void {
  const entityMap = new Map(graph.entities.map(e => [e.name, e]));

  // For each parent entity, look at its children
  for (const parent of graph.entities) {
    if (parent.components.length < 2) continue;

    // Find children that have peerVisible tools
    const childrenWithPeerTools: Array<{ entity: EntityIR; peerToolNames: string[] }> = [];

    for (const comp of parent.components) {
      const child = entityMap.get(comp.entity);
      if (!child) continue;

      const peerTools = child.tools.filter(t => t.peerVisible);
      if (peerTools.length > 0) {
        childrenWithPeerTools.push({
          entity: child,
          peerToolNames: peerTools.map(t => t.name),
        });
      }
    }

    if (childrenWithPeerTools.length === 0) continue;

    // For each sibling, auto-add refs to entities with peerVisible tools
    for (const comp of parent.components) {
      const sibling = entityMap.get(comp.entity);
      if (!sibling) continue;

      for (const { entity: peerEntity, peerToolNames } of childrenWithPeerTools) {
        // Don't add ref to self
        if (peerEntity.name === sibling.name) continue;

        // Skip if explicit ref already exists
        const existingRef = sibling.refs.find(r => r.entity === peerEntity.name);
        if (existingRef) continue;

        // Derive ref name from entity name (PascalCase → camelCase)
        const refName = peerEntity.name[0].toLowerCase() + peerEntity.name.slice(1);

        const inferredRef: RefIR = {
          name: refName,
          entity: peerEntity.name,
          inferred: true,
          visibleTools: peerToolNames,
        };

        sibling.refs.push(inferredRef);
      }
    }
  }
}
