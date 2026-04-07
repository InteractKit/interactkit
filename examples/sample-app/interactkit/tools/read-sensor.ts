import type { SensorEntity } from '../.generated/types.js';

export default async (entity: SensorEntity): Promise<number> => {
  const value = Math.round((20 + Math.random() * 15) * 10) / 10;
  entity.state.readingCount++;
  entity.streams.readings.emit(value);
  return value;
};
