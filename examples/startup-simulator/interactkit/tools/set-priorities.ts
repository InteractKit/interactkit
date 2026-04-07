import type { CEOEntity, CEOSetPrioritiesInput } from '../.generated/types.js';

export default async (entity: CEOEntity, input: CEOSetPrioritiesInput): Promise<void> => {
  entity.state.priorities = input.priorities;
};
