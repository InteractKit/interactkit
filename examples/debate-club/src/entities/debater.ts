import {
  Entity,
  LLMEntity,
  Executor,
  State,
  Tool,
  Describe,
} from "@interactkit/sdk";
import { ChatOpenAI } from "@langchain/openai";

@Entity({ description: "LLM debater that argues for or against a topic" })
export class Debater extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @State({ description: "Name of this debater" })
  private name = "Debater";

  @State({ description: "Which side this debater argues" })
  private side = "for";

  @State({ description: "Arguing style" })
  private style = "logical and persuasive";

  @Describe()
  describe() {
    return `You are ${this.name}, arguing ${this.side} the topic. Style: ${this.style}. Keep arguments concise (2-3 sentences). Address your opponent's points directly.`;
  }

  @Tool({ description: "Configure this debater's identity" })
  async configure(input: { name: string; side: string; style: string }): Promise<void> {
    this.name = input.name;
    this.side = input.side;
    this.style = input.style;
  }

  @Tool({ description: "Make an argument for the current side of the debate" })
  async argue(input: {
    topic: string;
    opponentArgument?: string;
    round: number;
  }): Promise<string> {
    let message = `Topic: "${input.topic}"\nYou are arguing ${this.side} this topic. This is round ${input.round}.`;

    if (input.opponentArgument) {
      message += `\n\nYour opponent's last argument:\n"${input.opponentArgument}"\n\nRespond directly to their points while making your own case.`;
    } else {
      message += `\n\nMake your opening argument.`;
    }

    message += `\n\nKeep your response to 2-3 sentences. Be ${this.style}.`;

    const response = await this.invoke({ message });
    return response;
  }
}
