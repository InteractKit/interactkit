import type { StartupEntity, StartupMessageInput } from '../.generated/types.js';

export default async (entity: StartupEntity, input: StartupMessageInput): Promise<string> => {
  await entity.components.slack.send({ from: 'human', text: `@${input.to}: ${input.message}` });
  return 'Message sent';
};
