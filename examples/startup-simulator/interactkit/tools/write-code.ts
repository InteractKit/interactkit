import type { DeveloperEntity, DeveloperWriteCodeInput } from '../.generated/types.js';

export default async (entity: DeveloperEntity, input: DeveloperWriteCodeInput): Promise<void> => {
  entity.state.filesWritten++;
  await entity.refs.codebase.writeFile({ path: input.path, content: input.content });
};
