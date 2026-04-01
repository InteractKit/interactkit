import {
  Entity,
  BaseEntity,
  Hook,
  Init,
  Component,
  Tool,
  type Remote,
} from "@interactkit/sdk";
import { HttpRequest } from "@interactkit/http";
import { WsConnection, WsMessage } from "@interactkit/websocket";
import { readFileSync } from "node:fs";
import { NoteStore } from "./note-store.js";
import { NotesManager } from "./notes-manager.js";

interface Client {
  send: (msg: string) => void;
  _pinned: unknown;
}

@Entity({ description: "Smart Notepad — LLM-powered note taking" })
export class Notepad extends BaseEntity {
  @Component() private noteStore!: Remote<NoteStore>;
  @Component() private notesManager!: Remote<NotesManager>;

  private clients = new Map<string, Client>();

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log("\n  [notepad] Smart Notepad ready");
    console.log("    UI:        http://localhost:3000");
    console.log("    WebSocket: ws://localhost:3001\n");

    this.notesManager.notifications.on("data", (notification: unknown) => {
      const msg = JSON.stringify({ type: "notification", ...(notification as Record<string, unknown>) });
      for (const client of this.clients.values()) {
        client.send(msg);
      }
    });

    this.notesManager.reviewAllNotes();

    this.noteStore.changes.on("data", (change: unknown) => {
      const msg = JSON.stringify({ type: "note:changed", ...(change as Record<string, unknown>) });
      for (const client of this.clients.values()) {
        client.send(msg);
      }
    });
  }

  @Hook(HttpRequest.Runner({ port: 3000, path: "/" }))
  async onHttpRequest(input: Remote<HttpRequest.Input>) {
    const html = readFileSync("public/index.html", "utf-8");
    await input.respond(200, html, { "Content-Type": "text/html" });
  }

  @Hook(WsConnection.Runner({ port: 3001 }))
  async onWsConnect(input: Remote<WsConnection.Input>) {
    const clientId = await input.clientId;
    this.clients.set(clientId, {
      send: (msg: string) => input.send(msg),
      _pinned: input,
    });
    console.log(`  [notepad] client connected: ${clientId}`);
  }

  @Hook(WsMessage.Runner({ port: 3001 }))
  async onWsMessage(input: Remote<WsMessage.Input>) {
    const raw = await input.data;
    const clientId = await input.clientId;
    const client = this.clients.get(clientId);
    if (!client) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      client.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "add": {
        if (!msg.text) {
          client.send(JSON.stringify({ type: "error", message: "Missing text" }));
          return;
        }
        const text = msg.text as string;
        const { id } = await this.noteStore.addNote({ text });
        const note = await this.noteStore.getNote({ id });
        client.send(JSON.stringify({ type: "added", note }));
        this.notesManager.onNoteAdded({ id, text });
        break;
      }

      case "list": {
        const notes = await this.noteStore.listNotes();
        client.send(JSON.stringify({ type: "list", notes }));
        break;
      }

      case "search": {
        if (!msg.query) {
          client.send(JSON.stringify({ type: "error", message: "Missing query" }));
          return;
        }
        const results = await this.noteStore.searchNotes({ query: msg.query as string });
        client.send(JSON.stringify({ type: "search", notes: results }));
        break;
      }

      default:
        client.send(JSON.stringify({ type: "error", message: `Unknown type: ${msg.type}` }));
    }
  }

  @Tool({ description: "Get count of connected clients" })
  async getClientCount(): Promise<number> {
    return this.clients.size;
  }
}
