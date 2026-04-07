import type { SensorEntity } from '../.generated/types.js';

export default async (entity: SensorEntity): Promise<number> => {
  return entity.state.readingCount;
};
