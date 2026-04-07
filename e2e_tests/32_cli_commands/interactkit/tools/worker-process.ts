import type { WorkerEntity, WorkerProcessInput, WorkerProcessOutput } from '../.generated/types.js';

export default async function (entity: WorkerEntity, input: WorkerProcessInput): Promise<WorkerProcessOutput> {
  entity.state.processed++;
  return { result: input.data.toUpperCase() };
}
