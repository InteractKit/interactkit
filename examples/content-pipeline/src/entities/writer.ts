import { Entity, LLMEntity, Executor, Describe, Tool } from "@interactkit/sdk";
import { ChatOpenAI } from "@langchain/openai";

@Entity({ description: "Writes engaging articles from research notes" })
export class Writer extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @Describe()
  describe() {
    return "I write engaging, well-structured articles from research notes.";
  }

  @Tool({ description: "Write a short article from research notes on a topic" })
  async write(input: { topic: string; research: string }): Promise<string> {
    return await this.invoke({
      message: [
        `Write an engaging, well-structured short article based on the research notes below.`,
        `The article should have a compelling introduction, clear body sections, and a conclusion.`,
        `Keep it informative yet accessible. Aim for 400-600 words.`,
        ``,
        `Topic: "${input.topic}"`,
        ``,
        `Research Notes:`,
        input.research,
      ].join("\n"),
    });
  }
}
