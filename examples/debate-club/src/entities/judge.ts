import {
  Entity,
  LLMEntity,
  Executor,
  Tool,
  Describe,
} from "@interactkit/sdk";
import { ChatOpenAI } from "@langchain/openai";

@Entity({ description: "Impartial debate judge that scores arguments" })
export class Judge extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @Describe()
  describe() {
    return "You are an impartial debate judge. Score arguments on logic, evidence, and persuasiveness.";
  }

  @Tool({ description: "Score a round of debate between two sides" })
  async scoreRound(input: {
    topic: string;
    forArgument: string;
    againstArgument: string;
    round: number;
  }): Promise<{ forScore: number; againstScore: number; commentary: string }> {
    const message = [
      `Topic: "${input.topic}"`,
      `Round ${input.round}`,
      ``,
      `FOR argument: "${input.forArgument}"`,
      ``,
      `AGAINST argument: "${input.againstArgument}"`,
      ``,
      `Score each argument from 1-10 on logic, evidence, and persuasiveness.`,
      `Respond with JSON only: { "forScore": <number>, "againstScore": <number>, "commentary": "<brief 1-2 sentence commentary>" }`,
    ].join("\n");

    const response = await this.invoke({ message });

    try {
      const parsed = JSON.parse(response);
      return {
        forScore: parsed.forScore ?? 5,
        againstScore: parsed.againstScore ?? 5,
        commentary: parsed.commentary ?? "",
      };
    } catch {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          forScore: parsed.forScore ?? 5,
          againstScore: parsed.againstScore ?? 5,
          commentary: parsed.commentary ?? "",
        };
      }
      return { forScore: 5, againstScore: 5, commentary: "Could not parse scores." };
    }
  }

  @Tool({ description: "Deliver a final verdict after all rounds" })
  async finalVerdict(input: {
    topic: string;
    rounds: Array<{
      forArg: string;
      againstArg: string;
      forScore: number;
      againstScore: number;
    }>;
  }): Promise<string> {
    const roundSummaries = input.rounds
      .map(
        (r, i) =>
          `Round ${i + 1}: FOR (${r.forScore}/10): "${r.forArg}" | AGAINST (${r.againstScore}/10): "${r.againstArg}"`,
      )
      .join("\n");

    const totalFor = input.rounds.reduce((sum, r) => sum + r.forScore, 0);
    const totalAgainst = input.rounds.reduce((sum, r) => sum + r.againstScore, 0);

    const message = [
      `Topic: "${input.topic}"`,
      ``,
      `Debate Summary:`,
      roundSummaries,
      ``,
      `Total Scores — FOR: ${totalFor}, AGAINST: ${totalAgainst}`,
      ``,
      `Deliver a final verdict in 2-3 sentences. Declare the winner and explain why they won. Be dramatic and entertaining.`,
    ].join("\n");

    const response = await this.invoke({ message });
    return response;
  }
}
