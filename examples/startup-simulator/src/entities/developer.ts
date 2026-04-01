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
import { TaskBoard } from "./task-board.js";
import { SlackChannel } from "./slack-channel.js";
import { Codebase } from "./codebase.js";
import { DesignSystem } from "./design-system.js";

@Entity({ description: "Lead Developer — picks tasks, writes code, runs tests, submits for review" })
export class Developer extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @ThinkingLoop({ intervalMs: 10000, alwaysThink: true })
  private thinkingLoop!: LLMThinkingLoop;

  @State({ description: "Currently working on task ID" })
  private currentTaskId = "";

  @State({ description: "Files written this session" })
  private filesWritten: string[] = [];

  @Describe()
  describe() {
    return `You are the Lead Developer of a startup. Current task: "${this.currentTaskId || "none"}".
Files written: ${this.filesWritten.length ? this.filesWritten.join(", ") : "none yet"}.
You pick tasks from the board, write code, run tests, and submit for review.
Check the design system for UI specs and wireframes before implementing frontend code.
Write clean, well-structured TypeScript/JavaScript code. Use modern patterns and best practices.
Announce completed work in Slack. Move tasks through the board as you progress.`;
  }

  @Ref() private taskBoard!: Remote<TaskBoard>;
  @Ref() private slack!: Remote<SlackChannel>;
  @Ref() private codebase!: Remote<Codebase>;
  @Ref() private designSystem!: Remote<DesignSystem>;

  @Tool({ description: "Write a code file to the codebase and announce in Slack", llmCallable: true })
  async writeCode(input: { path: string; content: string }): Promise<string> {
    await this.codebase.writeFile({
      path: input.path,
      content: input.content,
      author: "Developer",
    });
    if (!this.filesWritten.includes(input.path)) {
      this.filesWritten.push(input.path);
    }
    await this.slack.send({
      from: "Developer",
      text: `Wrote file: ${input.path}`,
    });
    return `File written: ${input.path}`;
  }

  @Tool({ description: "Run tests against the current codebase", llmCallable: true })
  async runTests(): Promise<string> {
    const files = await this.codebase.listFiles();
    if (files.length === 0) return "No files in codebase yet. Nothing to test.";
    const issues: string[] = [];
    for (const path of files) {
      const file = await this.codebase.readFile({ path });
      if (!file) continue;
      if (file.content.includes("TODO")) issues.push(`${path}: contains TODO`);
      if (file.content.includes("any")) issues.push(`${path}: uses 'any' type`);
      if (!file.content.includes("export")) issues.push(`${path}: no exports found`);
    }
    if (issues.length === 0) return `All ${files.length} files passed basic checks.`;
    return `Found ${issues.length} issues:\n${issues.join("\n")}`;
  }

  @Tool({ description: "Pick the highest priority available task and start working on it", llmCallable: true })
  async pickTask(): Promise<string> {
    const tasks = await this.taskBoard.getTasks({ assignee: "Developer", status: "todo" });
    if (!Array.isArray(tasks) || tasks.length === 0) return "No tasks assigned to Developer in todo status.";
    const task = tasks[0];
    await this.taskBoard.moveTask({ id: task.id, status: "in-progress" });
    this.currentTaskId = task.id;
    return `Picked task "${task.title}" (${task.id}). Description: ${task.description}`;
  }

  @Tool({ description: "Receive an update from another agent" })
  async receiveUpdate(input: { update: string }): Promise<string> {
    return this.invoke({
      message: `Update from the team: "${input.update}". Review this and take appropriate action — pick a task, write code, or run tests as needed.`,
    });
  }
}
