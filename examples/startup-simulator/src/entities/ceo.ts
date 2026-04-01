import {
  LLMEntity,
  Entity,
  Ref,
  type Remote,
  State,
  Tool,
  Executor,
  Describe,
  ThinkingLoop,
  LLMThinkingLoop,
} from "@interactkit/sdk";
import { ChatOpenAI } from "@langchain/openai";
import { Whiteboard } from "./whiteboard.js";
import { TaskBoard } from "./task-board.js";
import { SlackChannel } from "./slack-channel.js";

@Entity({ description: "CEO — sets vision, evaluates progress, makes strategic decisions" })
export class CEO extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @ThinkingLoop({ intervalMs: 15000, alwaysThink: true })
  private thinkingLoop!: LLMThinkingLoop;

  @State({ description: "Current company vision" })
  private vision = "";

  @State({ description: "Strategic priorities" })
  private priorities: string[] = [];

  @Describe()
  describe() {
    return `You are the CEO of a startup. Your vision: "${this.vision || "not set yet"}".
Priorities: ${this.priorities.length ? this.priorities.join(", ") : "none set"}.
You set the direction, evaluate progress, make pivots, and keep the team aligned.
Check the whiteboard for updates, review task progress, and communicate via Slack.
Be decisive but thoughtful. Think about market fit, user needs, and execution speed.`;
  }

  @Ref() private whiteboard!: Remote<Whiteboard>;
  @Ref() private taskBoard!: Remote<TaskBoard>;
  @Ref() private slack!: Remote<SlackChannel>;

  @Tool({ description: "Set or update the company vision", llmCallable: true })
  async setVision(input: { vision: string }): Promise<string> {
    this.vision = input.vision;
    return `Vision updated: ${input.vision}`;
  }

  @Tool({ description: "Set strategic priorities", llmCallable: true })
  async setPriorities(input: { priorities: string[] }): Promise<string> {
    this.priorities = input.priorities;
    return `Priorities set: ${input.priorities.join(", ")}`;
  }

  @Tool({ description: "Check the team budget based on total thinking cycles", llmCallable: true })
  async checkBudget(): Promise<string> {
    return `Budget status: ${this.thinkingLoop.tickCount} thinking cycles used so far.`;
  }

  @Tool({ description: "Receive a startup idea to work on" })
  async receiveIdea(input: { idea: string }): Promise<string> {
    return this.invoke({
      message: `New startup idea from the founder: "${input.idea}". Think about this deeply. Set a vision, define priorities, post to the whiteboard, and announce to the team via Slack.`,
    });
  }
}
