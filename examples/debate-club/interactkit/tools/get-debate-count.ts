import type { ArenaEntity } from '../.generated/types.js';

export default async (entity: ArenaEntity): Promise<number> => {
  return entity.state.debates.length;
};
