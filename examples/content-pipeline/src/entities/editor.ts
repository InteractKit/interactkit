import { Entity, LLMEntity, Executor, Describe, Tool } from "@interactkit/sdk";
import { ChatOpenAI } from "@langchain/openai";

@Entity({ description: "Polishes articles for clarity, grammar, and flow" })
export class Editor extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @Describe()
  describe() {
    return "I polish articles for clarity, grammar, and flow.";
  }

  @Tool({ description: "Edit and polish a draft article for clarity, grammar, and flow" })
  async edit(input: { draft: string }): Promise<string> {
    return await this.invoke({
      message: [
        `Edit and polish the following article draft. Improve clarity, fix grammar,`,
        `enhance flow, strengthen transitions, and tighten prose. Keep the same`,
        `structure and meaning but make it publication-ready.`,
        `Return only the improved article text.`,
        ``,
        `Draft:`,
        input.draft,
      ].join("\n"),
    });
  }
}
