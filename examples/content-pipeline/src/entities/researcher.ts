import { Entity, LLMEntity, Executor, Describe, Tool } from "@interactkit/sdk";
import { ChatOpenAI } from "@langchain/openai";

@Entity({ description: "Researches topics and produces structured notes" })
export class Researcher extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @Describe()
  describe() {
    return "I research topics and produce structured notes with key facts, statistics, and insights.";
  }

  @Tool({ description: "Research a topic and return structured bullet-point notes" })
  async research(input: { topic: string }): Promise<string> {
    return await this.invoke({
      message: [
        `Research the following topic and produce comprehensive, structured bullet-point notes.`,
        `Include key facts, relevant context, interesting angles, and potential subtopics.`,
        `Format as clean bullet points grouped by theme. Be thorough but concise.`,
        ``,
        `Topic: "${input.topic}"`,
      ].join("\n"),
    });
  }
}
