import {
  Entity,
  BaseEntity,
  Hook,
  Init,
  Component,
  State,
  type Remote,
} from "@interactkit/sdk";
import { HttpRequest } from "@interactkit/http";
import { WsConnection, WsMessage } from "@interactkit/websocket";
import { readFileSync } from "node:fs";
import { Researcher } from "./researcher.js";
import { Writer } from "./writer.js";
import { Editor } from "./editor.js";

interface Client {
  send: (msg: string) => void;
  _pinned: unknown;
}

interface Job {
  id: string;
  topic: string;
  status: string;
  research?: string;
  draft?: string;
  final?: string;
  startedAt: number;
  completedAt?: number;
}

@Entity({ description: "Content Pipeline — multi-agent content creation" })
export class Pipeline extends BaseEntity {
  @Component() private researcher!: Remote<Researcher>;
  @Component() private writer!: Remote<Writer>;
  @Component() private editor!: Remote<Editor>;

  // In-memory client tracking (not persisted)
  private clients = new Map<string, Client>();

  @State({ description: "Pipeline jobs" })
  private jobs: Job[] = [];

  @Hook(Init.Runner())
  async onInit(_input: Init.Input) {
    console.log("\n  [pipeline] Content Pipeline ready");
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
    console.log(`  [pipeline] client connected: ${clientId}`);
  }

  @Hook(WsMessage.Runner({ port: 3001 }))
  async onWsMessage(input: Remote<WsMessage.Input>) {
    const raw = await input.data;
    const clientId = await input.clientId;
    const client = this.clients.get(clientId);
    if (!client) return;

    let msg: { type: string; topic?: string; id?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      client.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "submit": {
        if (!msg.topic) {
          client.send(JSON.stringify({ type: "error", message: "Missing topic" }));
          return;
        }
        await this.runPipeline(msg.topic, client);
        break;
      }

      case "list": {
        const summary = this.jobs.map(({ id, topic, status, startedAt, completedAt }) => ({
          id, topic, status, startedAt, completedAt,
        }));
        client.send(JSON.stringify({ type: "list", jobs: summary }));
        break;
      }

      case "get": {
        if (!msg.id) {
          client.send(JSON.stringify({ type: "error", message: "Missing id" }));
          return;
        }
        const job = this.jobs.find((j) => j.id === msg.id);
        if (!job) {
          client.send(JSON.stringify({ type: "error", message: "Job not found" }));
          return;
        }
        client.send(JSON.stringify({ type: "job", job }));
        break;
      }

      default:
        client.send(JSON.stringify({ type: "error", message: `Unknown type: ${msg.type}` }));
    }
  }

  private async runPipeline(topic: string, client: Client) {
    const job: Job = {
      id: crypto.randomUUID(),
      topic,
      status: "researching",
      startedAt: Date.now(),
    };
    this.jobs.push(job);
    client.send(JSON.stringify({ type: "progress", job: { ...job } }));

    // Stage 1: Research
    const research = await this.researcher.research({ topic });
    job.research = research;
    job.status = "writing";
    client.send(JSON.stringify({ type: "progress", job: { ...job } }));

    // Stage 2: Write
    const draft = await this.writer.write({ topic, research });
    job.draft = draft;
    job.status = "editing";
    client.send(JSON.stringify({ type: "progress", job: { ...job } }));

    // Stage 3: Edit
    const final = await this.editor.edit({ draft });
    job.final = final;
    job.status = "done";
    job.completedAt = Date.now();
    client.send(JSON.stringify({ type: "progress", job: { ...job } }));

    console.log(`  [pipeline] job ${job.id} completed: "${topic}"`);
  }
}
