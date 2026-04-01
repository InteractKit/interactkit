import {
  Entity,
  BaseEntity,
  Component,
  Hook,
  Init,
  Tool,
  Describe,
  type Remote,
} from "@interactkit/sdk";
import { Whiteboard } from "./whiteboard.js";
import { TaskBoard } from "./task-board.js";
import { SlackChannel } from "./slack-channel.js";
import { Codebase } from "./codebase.js";
import { DesignSystem } from "./design-system.js";
import { CEO } from "./ceo.js";
import { CTO } from "./cto.js";
import { Designer } from "./designer.js";
import { Developer } from "./developer.js";

@Entity({ description: "Startup Simulator — watch an AI team build a startup from scratch" })
export class Startup extends BaseEntity {
  // Shared resources
  @Component() private whiteboard!: Remote<Whiteboard>;
  @Component() private taskBoard!: Remote<TaskBoard>;
  @Component() private slack!: Remote<SlackChannel>;
  @Component() private codebase!: Remote<Codebase>;
  @Component() private designSystem!: Remote<DesignSystem>;

  // Team
  @Component() private ceo!: Remote<CEO>;
  @Component() private cto!: Remote<CTO>;
  @Component() private designer!: Remote<Designer>;
  @Component() private developer!: Remote<Developer>;

  @Describe()
  describe() {
    return "Startup Simulator: AI team with CEO, CTO, Designer, and Developer building a product.";
  }

  @Hook(Init.Runner())
  async onInit(_input: Init.Input) {
    console.log("\n  [startup] Startup Simulator ready");
    console.log("  [startup] Use the dashboard observer to call startup.launch({ idea: '...' })\n");
  }

  @Tool({ description: 'Launch the startup with an idea. CEO will take it from here.' })
  async launch(input: { idea: string }): Promise<string> {
    await this.slack.send({ from: "Founder", text: `New startup idea: ${input.idea}` });
    await this.whiteboard.post({ from: "Founder", title: "Startup Idea", content: input.idea });

    // Push to CEO's thinking loop — CEO autonomously sets vision, announces, delegates
    // Other agents pick up via their own thinking loops watching whiteboard/taskBoard/slack
    const response = await this.ceo.receiveIdea({ idea: input.idea });
    return response;
  }

  @Tool({ description: 'Send a message to the team as the Founder' })
  async message(input: { text: string }): Promise<void> {
    await this.slack.send({ from: "Founder", text: input.text });
  }

  @Tool({ description: 'Get a summary of the current startup state' })
  async status(): Promise<{
    files: string[];
    taskCount: number;
    messageCount: number;
    assetCount: number;
  }> {
    const [files, tasks, messages, assets] = await Promise.all([
      this.codebase.listFiles(),
      this.taskBoard.getTasks({}),
      this.slack.getHistory({ count: 50 }),
      this.designSystem.listAssets(),
    ]);
    return {
      files,
      taskCount: tasks.length,
      messageCount: messages.length,
      assetCount: assets.length,
    };
  }
}
