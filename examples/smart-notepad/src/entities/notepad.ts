import {
  Entity,
  BaseEntity,
  Hook,
  Init,
  Component,
  State,
  Tool,
  type Remote,
} from "@interactkit/sdk";
import { HttpRequest } from "@interactkit/http";
import { WsConnection, WsMessage } from "@interactkit/websocket";
import { readFileSync } from "node:fs";
import { NoteStore } from "./note-store.js";
import { Tagger } from "./tagger.js";

interface Client {
  send: (msg: string) => void;
  _pinned: unknown;
}

@Entity({ description: "Smart Notepad — LLM-powered note taking with auto-tagging" })
export class Notepad extends BaseEntity {
  @Component() private noteStore!: Remote<NoteStore>;
  @Component() private tagger!: Remote<Tagger>;

  // In-memory client tracking (not persisted)
  private clients = new Map<string, Client>();

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    console.log("\n  [notepad] Smart Notepad ready");
    console.log("    UI:        http://localhost:3000");
    console.log("    WebSocket: ws://localhost:3001\n");
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

    let msg: { type: string; text?: string; query?: string; id?: string };
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
        const { id } = await this.noteStore.addNote({ text: msg.text });
        // Auto-tag in the background, then send the updated note
        await this.tagger.tagNote({ id });
        const note = await this.noteStore.getNote({ id });
        client.send(JSON.stringify({ type: "added", note }));
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
        const results = await this.noteStore.searchNotes({ query: msg.query });
        client.send(JSON.stringify({ type: "search", notes: results }));
        break;
      }

      case "related": {
        if (!msg.id) {
          client.send(JSON.stringify({ type: "error", message: "Missing id" }));
          return;
        }
        const relatedIds = await this.tagger.findRelated({ id: msg.id });
        client.send(JSON.stringify({ type: "related", id: msg.id, relatedIds }));
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
