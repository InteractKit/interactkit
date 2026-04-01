import {
  Entity,
  BaseEntity,
  State,
  Tool,
  Describe,
} from "@interactkit/sdk";

interface DesignAsset {
  name: string;
  type: "wireframe" | "component" | "palette";
  content: string;
  author: string;
  createdAt: number;
}

@Entity({
  description: "Design system — wireframes, components, and style guide",
})
export class DesignSystem extends BaseEntity {
  @State({ description: "Design assets" })
  private assets: DesignAsset[] = [];

  @Describe()
  describe() {
    const counts = { wireframe: 0, component: 0, palette: 0 };
    for (const a of this.assets) counts[a.type]++;
    return `Design system: ${counts.wireframe} wireframes, ${counts.component} components, ${counts.palette} palettes`;
  }

  @Tool({
    description:
      "Save a design asset (wireframe SVG, component spec, or color palette)",
  })
  async saveAsset(input: {
    name: string;
    type: "wireframe" | "component" | "palette";
    content: string;
    author: string;
  }): Promise<void> {
    const existing = this.assets.find((a) => a.name === input.name);
    if (existing) {
      existing.type = input.type;
      existing.content = input.content;
      existing.author = input.author;
      existing.createdAt = Date.now();
    } else {
      this.assets.push({
        name: input.name,
        type: input.type,
        content: input.content,
        author: input.author,
        createdAt: Date.now(),
      });
    }
  }

  @Tool({ description: "Get a design asset by name" })
  async getAsset(input: { name: string }): Promise<DesignAsset | null> {
    return this.assets.find((a) => a.name === input.name) ?? null;
  }

  @Tool({ description: "List all design assets" })
  async listAssets(): Promise<Array<{ name: string; type: string }>> {
    return this.assets.map((a) => ({ name: a.name, type: a.type }));
  }

  @Tool({ description: "Get the current color palette" })
  async getPalette(): Promise<string | null> {
    const palette = this.assets.find((a) => a.type === "palette");
    return palette ? palette.content : null;
  }
}
