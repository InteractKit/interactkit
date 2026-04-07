import type { CEOEntity, CEOSetVisionInput } from '../.generated/types.js';

export default async (entity: CEOEntity, input: CEOSetVisionInput): Promise<void> => {
  entity.state.vision = input.vision;
};
