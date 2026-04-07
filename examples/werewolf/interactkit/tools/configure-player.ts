import type { PlayerEntity, PlayerConfigureInput } from '../.generated/types.js';

export default async (entity: PlayerEntity, input: PlayerConfigureInput): Promise<void> => {
  entity.state.name = input.name;
  entity.state.role = input.role;
  entity.state.personality = input.personality;
};
