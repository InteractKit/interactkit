import {
  Entity,
  BaseEntity,
  State,
  Tool,
  Describe,
} from "@interactkit/sdk";

@Entity({ description: "Shared whiteboard for team communication" })
export class Whiteboard extends BaseEntity {
  @State({ description: "Posted items" })
  private items: Array<{
    from: string;
    title: string;
    content: string;
    timestamp: number;
  }> = [];

  @Describe()
  describe() {
    const recent = this.items.slice(-3).map((i) => i.title).join(", ");
    return `Whiteboard: ${this.items.length} posts. Recent: ${recent || "none"}`;
  }

  @Tool({ description: "Post a message or document to the whiteboard" })
  async post(input: {
    from: string;
    title: string;
    content: string;
  }): Promise<void> {
    this.items.push({ ...input, timestamp: Date.now() });
  }

  @Tool({ description: "Read all whiteboard posts" })
  async read(): Promise<
    Array<{ from: string; title: string; content: string }>
  > {
    return this.items.map(({ from, title, content }) => ({
      from,
      title,
      content,
    }));
  }

  @Tool({ description: "Get the most recent post matching a topic" })
  async getLatest(input: {
    topic: string;
  }): Promise<{ from: string; title: string; content: string } | null> {
    const query = input.topic.toLowerCase();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (
        item.title.toLowerCase().includes(query) ||
        item.content.toLowerCase().includes(query)
      ) {
        return { from: item.from, title: item.title, content: item.content };
      }
    }
    return null;
  }
}
