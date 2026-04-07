import type {
  PipelineEntity,
  PipelineProcessInput,
  PipelineProcessOutput,
} from "../.generated/types.js";

export default async (
  entity: PipelineEntity,
  input: PipelineProcessInput,
): Promise<PipelineProcessOutput> => {
  const research = await entity.components.researcher.research({
    topic: input.topic,
  });
  const draft = await entity.components.writer.write({
    topic: input.topic,
    research,
  });
  const final = await entity.components.editor.edit({ draft });

  entity.state.jobs.push({
    topic: input.topic,
    status: "done",
    output: final,
    id: "",
  });
  return { research, draft, final };
};
