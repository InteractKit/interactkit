import type { PlayerEntity } from '../.generated/types.js';

export default async (entity: PlayerEntity): Promise<string> => {
  return entity.state.role;
};
