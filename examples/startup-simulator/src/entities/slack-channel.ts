import {
  Entity,
  BaseEntity,
  State,
  Tool,
  Describe,
} from "@interactkit/sdk";

interface Message {
  from: string;
  text: string;
  timestamp: number;
}

@Entity({ description: "Team Slack channel for announcements and updates" })
export class SlackChannel extends BaseEntity {
  @State({ description: "Message history" })
  private messages: Message[] = [];

  @Describe()
  describe() {
    return `Slack: ${this.messages.length} messages.`;
  }

  @Tool({ description: "Send a message to the team channel" })
  async send(input: { from: string; text: string }): Promise<void> {
    this.messages.push({
      from: input.from,
      text: input.text,
      timestamp: Date.now(),
    });
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }
  }

  @Tool({ description: "Get recent messages" })
  async getHistory(input: { count?: number }): Promise<Message[]> {
    const n = input.count ?? 20;
    return this.messages.slice(-n);
  }
}
