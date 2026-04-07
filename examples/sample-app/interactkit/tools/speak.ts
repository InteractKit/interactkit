import type { MouthEntity, MouthSpeakInput } from '../.generated/types.js';

export default async (entity: MouthEntity, input: MouthSpeakInput): Promise<void> => {
  entity.state.history.push({ message: input.message });
  entity.streams.transcript.emit(input.message);
};
