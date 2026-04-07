import type { CTOEntity, CTOCreateArchitectureInput } from '../.generated/types.js';

export default async (entity: CTOEntity, input: CTOCreateArchitectureInput): Promise<void> => {
  entity.state.architecture = input.architecture;
  entity.state.techStack = input.techStack;
};
