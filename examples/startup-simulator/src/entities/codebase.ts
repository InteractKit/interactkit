import {
  Entity,
  BaseEntity,
  State,
  Tool,
  Describe,
} from "@interactkit/sdk";

interface CodeFile {
  path: string;
  content: string;
  author: string;
  updatedAt: number;
}

@Entity({
  description: "Project codebase — virtual filesystem for code files",
})
export class Codebase extends BaseEntity {
  @State({ description: "All files in the project" })
  private files: CodeFile[] = [];

  @Describe()
  describe() {
    const paths = this.files.map((f) => f.path).join(", ");
    return `Codebase: ${this.files.length} files. Paths: ${paths || "none"}`;
  }

  @Tool({ description: "Write or update a file" })
  async writeFile(input: {
    path: string;
    content: string;
    author: string;
  }): Promise<void> {
    const existing = this.files.find((f) => f.path === input.path);
    if (existing) {
      existing.content = input.content;
      existing.author = input.author;
      existing.updatedAt = Date.now();
    } else {
      this.files.push({
        path: input.path,
        content: input.content,
        author: input.author,
        updatedAt: Date.now(),
      });
    }
  }

  @Tool({ description: "Read a file by path" })
  async readFile(input: {
    path: string;
  }): Promise<{ content: string; author: string } | null> {
    const file = this.files.find((f) => f.path === input.path);
    return file ? { content: file.content, author: file.author } : null;
  }

  @Tool({ description: "List all file paths in the project" })
  async listFiles(): Promise<string[]> {
    return this.files.map((f) => f.path);
  }

  @Tool({ description: "Search files for content matching a query" })
  async searchCode(input: {
    query: string;
  }): Promise<Array<{ path: string; matches: string[] }>> {
    const query = input.query.toLowerCase();
    const results: Array<{ path: string; matches: string[] }> = [];
    for (const file of this.files) {
      const lines = file.content.split("\n");
      const matches = lines.filter((l) => l.toLowerCase().includes(query));
      if (matches.length > 0) {
        results.push({ path: file.path, matches });
      }
    }
    return results;
  }
}
