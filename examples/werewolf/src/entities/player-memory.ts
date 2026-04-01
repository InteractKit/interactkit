import {
  Entity,
  BaseEntity,
  State,
  Tool,
  Describe,
} from "@interactkit/sdk";

@Entity({ description: "Memory store for a Werewolf player" })
export class PlayerMemory extends BaseEntity {
  @State({ description: "Accumulated observations and knowledge" })
  private memories: string[] = [];

  @Describe()
  describe() {
    if (this.memories.length === 0) return "No memories yet.";
    const recent = this.memories.slice(-5);
    return `Memories (${this.memories.length} total, most recent): ${recent.join(" | ")}`;
  }

  @Tool({ description: "Add a memory entry" })
  add(input: { text: string }): void {
    this.memories.push(input.text);
    if (this.memories.length > 30) {
      this.memories = this.memories.slice(-30);
    }
  }

  @Tool({ description: "Get all memories" })
  getAll(): string[] {
    return [...this.memories];
  }

  @Tool({ description: "Get the N most recent memories" })
  getRecent(input: { count: number }): string[] {
    return this.memories.slice(-input.count);
  }
}
