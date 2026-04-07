import type { CacheEntity, CachePutInput, CachePutOutput } from '../.generated/types.js';

export default async function (entity: CacheEntity, input: CachePutInput): Promise<CachePutOutput> {
  if (!entity.state.entries || typeof entity.state.entries !== 'object') {
    entity.state.entries = {};
  }
  (entity.state.entries as Record<string, string>)[input.key] = input.value;
  return { stored: true };
}
