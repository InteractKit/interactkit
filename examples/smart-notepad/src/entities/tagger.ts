import {
  Entity,
  LLMEntity,
  Executor,
  Ref,
  Tool,
  Describe,
  type Remote,
} from "@interactkit/sdk";
import { ChatOpenAI } from "@langchain/openai";
import { NoteStore } from "./note-store.js";

@Entity({ description: "LLM-powered note tagger and summarizer" })
export class Tagger extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @Ref() private noteStore!: Remote<NoteStore>;

  @Describe()
  describe() {
    return "I analyze notes and generate tags and summaries. Use tagNote to tag a note by ID, findRelated to discover related notes, or suggestTags to preview tags for text.";
  }

  @Tool({ description: "Read a note, generate tags and a summary via LLM, then save them", llmCallable: true })
  async tagNote(input: { id: string }): Promise<string> {
    const note = await this.noteStore.getNote({ id: input.id });
    if (!note) return "Note not found.";

    const response = await this.invoke({
      message: [
        `Analyze this note and respond with JSON only: { "tags": ["tag1", "tag2", ...], "summary": "one sentence summary" }`,
        `Note text: "${note.text}"`,
      ].join("\n"),
    });

    try {
      const parsed = JSON.parse(response);
      await this.noteStore.updateNote({
        id: input.id,
        tags: parsed.tags ?? [],
        summary: parsed.summary ?? "",
      });
      return response;
    } catch {
      // LLM might wrap JSON in markdown — try extracting
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        await this.noteStore.updateNote({
          id: input.id,
          tags: parsed.tags ?? [],
          summary: parsed.summary ?? "",
        });
        return match[0];
      }
      return response;
    }
  }

  @Tool({ description: "Find notes related to a given note by tag overlap", llmCallable: true })
  async findRelated(input: { id: string }): Promise<string[]> {
    const note = await this.noteStore.getNote({ id: input.id });
    if (!note || note.tags.length === 0) return [];

    const all = await this.noteStore.listNotes();
    return all
      .filter(
        (n) =>
          n.id !== input.id &&
          n.tags.some((t) => note.tags.includes(t)),
      )
      .map((n) => n.id);
  }

  @Tool({ description: "Suggest tags for a piece of text without saving" })
  async suggestTags(input: { text: string }): Promise<string[]> {
    const response = await this.invoke({
      message: `Suggest 3-5 short tags for this text. Respond with a JSON array of strings only.\nText: "${input.text}"`,
    });

    try {
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      const match = response.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
      return [];
    }
  }
}
