import type { PlayerEntity } from '../.generated/types.js';

export default async (entity: PlayerEntity): Promise<boolean> => {
  entity.state.alive = false;
  return true;
};
