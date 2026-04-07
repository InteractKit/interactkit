import type { PlayerMemoryEntity, PlayerMemoryGetRecentInput } from '../.generated/types.js';

export default async (entity: PlayerMemoryEntity, input: PlayerMemoryGetRecentInput): Promise<string[]> => {
  return entity.state.memories.slice(-input.count);
};
