import type { ParsedEntity } from '@/codegen/parser/types/parsed-entity.js';

/**
 * Walk the recursive ParsedEntity tree and calculate deterministic
 * path IDs for every element (state, method, component, ref, stream, hook).
 *
 * Returns a Map keyed by "ClassName#propertyName" → path ID.
 */
export function calculatePaths(root: ParsedEntity): Map<string, string> {
  const paths = new Map<string, string>();
  walkEntity(root, root.type, paths);
  return paths;
}

function walkEntity(entity: ParsedEntity, prefix: string, paths: Map<string, string>): void {
  const key = (name: string) => `${entity.className}#${name}`;

  // State properties
  for (const state of entity.state) {
    paths.set(key(state.name), `${prefix}.${state.name}`);
  }

  // Methods
  for (const method of entity.methods) {
    paths.set(key(method.methodName), `${prefix}.${method.methodName}`);
  }

  // Hooks
  for (const hook of entity.hooks) {
    paths.set(key(hook.methodName), `${prefix}.${hook.methodName}`);
  }

  // Streams
  for (const stream of entity.streams) {
    paths.set(key(stream.propertyName), `${prefix}.${stream.propertyName}`);
  }

  // Refs
  for (const ref of entity.refs) {
    paths.set(key(ref.propertyName), `${prefix}.${ref.propertyName}`);
  }

  // Components — recurse into children
  for (const comp of entity.components) {
    const childPrefix = `${prefix}.${comp.propertyName}`;
    paths.set(key(comp.propertyName), childPrefix);

    if (comp.entity) {
      walkEntity(comp.entity, childPrefix, paths);
    }
  }
}
