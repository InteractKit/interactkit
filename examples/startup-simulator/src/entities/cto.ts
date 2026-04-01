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
import { Codebase } from "./codebase.js";

@Entity({ description: "CTO — breaks vision into technical tasks, reviews code, ensures quality" })
export class CTO extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @ThinkingLoop({ intervalMs: 12000, alwaysThink: true })
  private thinkingLoop!: LLMThinkingLoop;

  @State({ description: "Current technical architecture summary" })
  private architecture = "";

  @State({ description: "Tech stack decisions" })
  private techStack: string[] = [];

  @Describe()
  describe() {
    return `You are the CTO of a startup. Architecture: "${this.architecture || "not defined yet"}".
Tech stack: ${this.techStack.length ? this.techStack.join(", ") : "not decided"}.
You break the CEO's vision into technical tasks, assign work, review code, and ensure quality.
Check the whiteboard for vision updates, manage tasks on the board, review code in the codebase.
Communicate decisions and technical plans via Slack. Be pragmatic — ship fast but keep quality high.`;
  }

  @Ref() private whiteboard!: Remote<Whiteboard>;
  @Ref() private taskBoard!: Remote<TaskBoard>;
  @Ref() private slack!: Remote<SlackChannel>;
  @Ref() private codebase!: Remote<Codebase>;

  @Tool({ description: "Review a file from the codebase for quality and correctness", llmCallable: true })
  async reviewFile(input: { path: string }): Promise<string> {
    const file = await this.codebase.readFile({ path: input.path });
    if (!file) return `File not found: ${input.path}`;
    return `Review of ${input.path} (by ${file.author}):\n\`\`\`\n${file.content}\n\`\`\`\nAnalyze this code for quality, bugs, and improvements.`;
  }

  @Tool({ description: "Post a technical architecture document to the whiteboard", llmCallable: true })
  async createArchitecture(input: { description: string }): Promise<string> {
    this.architecture = input.description;
    await this.whiteboard.post({
      from: "CTO",
      title: "Technical Architecture",
      content: input.description,
    });
    return `Architecture posted to whiteboard: ${input.description.slice(0, 100)}...`;
  }

  @Tool({ description: "Receive an update from another agent" })
  async receiveUpdate(input: { update: string }): Promise<string> {
    return this.invoke({
      message: `Update from the team: "${input.update}". Review this and take appropriate technical action — create tasks, review code, or update architecture as needed.`,
    });
  }
}
