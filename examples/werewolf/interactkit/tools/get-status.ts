import type { GameEntity, GameGetStatusOutput } from '../.generated/types.js';

export default async (entity: GameEntity): Promise<GameGetStatusOutput> => {
  return {
    phase: entity.state.phase,
    round: entity.state.round,
    alivePlayers: 6,
  };
};
