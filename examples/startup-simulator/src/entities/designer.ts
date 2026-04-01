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
import { DesignSystem } from "./design-system.js";

@Entity({ description: "Lead Designer — creates wireframes, defines UI components, sets visual direction" })
export class Designer extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @ThinkingLoop({ intervalMs: 12000, alwaysThink: true })
  private thinkingLoop!: LLMThinkingLoop;

  @State({ description: "Current design direction" })
  private designDirection = "";

  @State({ description: "Wireframes created so far" })
  private wireframeCount = 0;

  @Describe()
  describe() {
    return `You are the Lead Designer of a startup. Design direction: "${this.designDirection || "not set yet"}".
Wireframes created: ${this.wireframeCount}.
You create wireframes as SVG markup, define UI component specs, and set the color palette.
Check the task board for design tasks, reference the whiteboard for product direction.
When creating wireframes, generate actual SVG with rectangles, text labels, and layout structure like:
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="10" width="380" height="40" fill="#eee" stroke="#333"/>
  <text x="200" y="35" text-anchor="middle" font-size="14">Header</text>
</svg>
Communicate design decisions via Slack. Keep designs clean, modern, and user-focused.`;
  }

  @Ref() private whiteboard!: Remote<Whiteboard>;
  @Ref() private taskBoard!: Remote<TaskBoard>;
  @Ref() private slack!: Remote<SlackChannel>;
  @Ref() private designSystem!: Remote<DesignSystem>;

  @Tool({ description: "Create a wireframe as SVG and save it to the design system", llmCallable: true })
  async createWireframe(input: { name: string; description: string }): Promise<string> {
    const svg = await this.invoke({
      message: `Generate a simple SVG wireframe for: "${input.description}". Return ONLY the SVG markup, nothing else. Use viewBox="0 0 400 300", rectangles for sections, and text labels.`,
    });
    await this.designSystem.saveAsset({
      name: input.name,
      type: "wireframe",
      content: svg,
      author: "Designer",
    });
    this.wireframeCount++;
    return `Wireframe "${input.name}" saved to design system.`;
  }

  @Tool({ description: "Define a UI component specification and save it", llmCallable: true })
  async defineComponent(input: { name: string; spec: string }): Promise<string> {
    await this.designSystem.saveAsset({
      name: input.name,
      type: "component",
      content: input.spec,
      author: "Designer",
    });
    return `Component "${input.name}" spec saved to design system.`;
  }

  @Tool({ description: "Set the color palette for the project", llmCallable: true })
  async setPalette(input: { colors: string[] }): Promise<string> {
    const content = JSON.stringify({ colors: input.colors }, null, 2);
    await this.designSystem.saveAsset({
      name: "palette",
      type: "palette",
      content,
      author: "Designer",
    });
    return `Color palette set: ${input.colors.join(", ")}`;
  }

  @Tool({ description: "Receive an update from another agent" })
  async receiveUpdate(input: { update: string }): Promise<string> {
    return this.invoke({
      message: `Update from the team: "${input.update}". Review this and take appropriate design action — create wireframes, define components, or update the palette as needed.`,
    });
  }
}
