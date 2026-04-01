import { Entity, BaseEntity, State, Tool, Describe } from "@interactkit/sdk";
import { randomUUID } from "node:crypto";

export interface Note {
  id: string;
  text: string;
  tags: string[];
  summary: string;
  createdAt: number;
}

@Entity({ description: "Persistent note storage with search" })
export class NoteStore extends BaseEntity {
  @State({ description: "All stored notes" })
  private notes: Note[] = [];

  @Describe()
  describe() {
    const count = this.notes.length;
    if (count === 0) return "No notes stored yet.";
    const recent = this.notes
      .slice(-3)
      .map((n) => n.text.slice(0, 40))
      .join(", ");
    return `${count} notes stored. Recent: ${recent}`;
  }

  @Tool({ description: "Add a new note and return its ID" })
  async addNote(input: { text: string }): Promise<{ id: string }> {
    const note: Note = {
      id: randomUUID(),
      text: input.text,
      tags: [],
      summary: "",
      createdAt: Date.now(),
    };
    this.notes.push(note);
    return { id: note.id };
  }

  @Tool({ description: "Get a note by ID" })
  async getNote(input: { id: string }): Promise<Note | null> {
    return this.notes.find((n) => n.id === input.id) ?? null;
  }

  @Tool({ description: "Update a note's tags and/or summary" })
  async updateNote(input: {
    id: string;
    tags?: string[];
    summary?: string;
  }): Promise<void> {
    const note = this.notes.find((n) => n.id === input.id);
    if (!note) return;
    if (input.tags) note.tags = input.tags;
    if (input.summary) note.summary = input.summary;
  }

  @Tool({ description: "List all notes" })
  async listNotes(): Promise<Note[]> {
    return this.notes;
  }

  @Tool({ description: "Search notes by keyword across text, tags, and summary" })
  async searchNotes(input: { query: string }): Promise<Note[]> {
    const q = input.query.toLowerCase();
    return this.notes.filter(
      (n) =>
        n.text.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
}
