import type { StartupEntity, StartupLaunchInput } from '../.generated/types.js';

export default async (entity: StartupEntity, input: StartupLaunchInput): Promise<string> => {
  await entity.components.ceo.setVision({ vision: input.vision });
  await entity.components.slack.send({ from: 'system', text: `Launched: ${input.vision}` });
  return 'Startup launched!';
};
