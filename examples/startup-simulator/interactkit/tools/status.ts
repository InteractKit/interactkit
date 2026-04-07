import type { StartupEntity, StartupStatusOutput } from '../.generated/types.js';

export default async (entity: StartupEntity): Promise<StartupStatusOutput> => {
  const tasks = await entity.components.taskBoard.getTasks();
  const files = await entity.components.codebase.listFiles();
  const messages = await entity.components.slack.getHistory();
  return { tasks: tasks.length, files: files.length, messages: messages.length };
};
