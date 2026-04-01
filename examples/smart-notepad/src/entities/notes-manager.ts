import {
  Entity,
  LLMEntity,
  Executor,
  Ref,
  Tool,
  Describe,
  Stream,
  type Remote,
  type EntityStream,
} from "@interactkit/sdk";
import { ChatOpenAI } from "@langchain/openai";
import { NoteStore } from "./note-store.js";

@Entity({ description: "LLM-powered notes manager with notifications" })
export class NotesManager extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @Ref() private noteStore!: Remote<NoteStore>;

  @Stream() notifications!: EntityStream<{ type: string; message: string }>;

  @Describe()
  describe() {
    return [
      "You are Smart Notepad's Notes Manager.",
      "You MUST use tools to take actions — never just describe what you would do.",
      "Use noteStore_updateNote to fix typos or improve text.",
      "Use noteStore_deleteNote to remove duplicates.",
      "Use noteStore_listNotes to check existing notes.",
      "Use sendNotification to inform the UI of changes.",
      "Always call the actual tool — never say you did something without calling the tool.",
    ].join(" ");
  }

  @Tool({ description: "Called on boot to review all existing notes" })
  async reviewAllNotes(): Promise<void> {
    this.notify(
      "You just booted up. List all notes and review them — fix typos, improve formatting, remove duplicates, and add tags/summaries where missing. Work through them one by one.",
    );
  }

  @Tool({ description: "Called when a new note is added" })
  async onNoteAdded(input: { id: string; text: string }): Promise<void> {
    this.notify(
      `A new note was just added (id: ${input.id}): "${input.text}". Review it — clean up formatting, check for duplicates, or improve structure if needed. Send a notification when done.`,
    );
  }

  @Tool({ description: "Send a notification to the UI", llmCallable: true })
  async sendNotification(input: { type: string; message: string }): Promise<void> {
    this.notifications.emit(input);
  }
}
