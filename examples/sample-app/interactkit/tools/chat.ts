import type { AgentEntity, AgentChatInput } from '../.generated/types.js';

export default async (entity: AgentEntity, input: AgentChatInput): Promise<string> => {
  return entity.components.brain.think({ query: input.message });
};
