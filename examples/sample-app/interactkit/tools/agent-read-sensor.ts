import type { AgentEntity } from '../.generated/types.js';

export default async (entity: AgentEntity): Promise<number> => {
  const value = await entity.components.sensor.read();
  entity.state.sensorReadings.push(value);
  return value;
};
