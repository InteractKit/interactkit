import type { AgentEntity, AgentAskInput } from '../.generated/types.js';

export default async (entity: AgentEntity, input: AgentAskInput): Promise<string> => {
  const answer = await entity.components.brain.think({ query: input.question });
  await entity.components.mouth.speak({ message: answer });
  await entity.components.memory.store({ text: `Q: ${input.question} A: ${answer}` });
  return answer;
};
