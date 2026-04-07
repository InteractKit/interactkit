import type { DebaterEntity, DebaterConfigureInput } from '../.generated/types.js';

export default async (entity: DebaterEntity, input: DebaterConfigureInput): Promise<void> => {
  entity.state.name = input.name;
  entity.state.side = input.side;
  if (input.style) entity.state.style = input.style;
};
