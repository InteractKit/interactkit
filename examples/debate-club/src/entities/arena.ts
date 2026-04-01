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
import { randomUUID } from "node:crypto";
import { Debater } from "./debater.js";
import { Judge } from "./judge.js";

interface Client {
  send: (msg: string) => void;
  _pinned: unknown;
}

interface DebateRound {
  forArg: string;
  againstArg: string;
  forScore: number;
  againstScore: number;
  commentary: string;
}

interface Debate {
  id: string;
  topic: string;
  status: string;
  rounds: DebateRound[];
  verdict?: string;
}

@Entity({ description: "Debate Club Arena — orchestrates debates between two LLM debaters with a judge" })
export class Arena extends BaseEntity {
  @Component() private debaterFor!: Remote<Debater>;
  @Component() private debaterAgainst!: Remote<Debater>;
  @Component() private judge!: Remote<Judge>;

  // In-memory client tracking (not persisted)
  private clients = new Map<string, Client>();

  @State({ description: "All debates" })
  private debates: Debate[] = [];

  @Hook(Init.Runner())
  async onInit(input: Init.Input) {
    await this.debaterFor.configure({
      name: 'Aristotle', side: 'for',
      style: 'logical and eloquent, drawing on classical reasoning',
    });
    await this.debaterAgainst.configure({
      name: 'Socrates', side: 'against',
      style: 'sharp and questioning, using the Socratic method',
    });

    console.log("\n  [debate-club] Debate Club Arena ready");
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
    console.log(`  [debate-club] client connected: ${clientId}`);
  }

  @Hook(WsMessage.Runner({ port: 3001 }))
  async onWsMessage(input: Remote<WsMessage.Input>) {
    const raw = await input.data;
    const clientId = await input.clientId;
    const client = this.clients.get(clientId);
    if (!client) return;

    let msg: { type: string; topic?: string; rounds?: number };
    try {
      msg = JSON.parse(raw);
    } catch {
      client.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "debate": {
        if (!msg.topic) {
          client.send(JSON.stringify({ type: "error", message: "Missing topic" }));
          return;
        }
        const numRounds = Math.min(Math.max(msg.rounds ?? 3, 1), 5);
        this.runDebate(msg.topic, numRounds, client);
        break;
      }

      case "list": {
        client.send(
          JSON.stringify({ type: "list", debates: this.debates }),
        );
        break;
      }

      default:
        client.send(
          JSON.stringify({ type: "error", message: `Unknown type: ${msg.type}` }),
        );
    }
  }

  private async runDebate(topic: string, numRounds: number, client: Client) {
    const debate: Debate = {
      id: randomUUID(),
      topic,
      status: "in-progress",
      rounds: [],
    };
    this.debates.push(debate);

    client.send(
      JSON.stringify({
        type: "started",
        debateId: debate.id,
        topic,
        totalRounds: numRounds,
      }),
    );

    let lastAgainstArg: string | undefined;

    for (let round = 1; round <= numRounds; round++) {
      // FOR side argues
      const forArg = await this.debaterFor.argue({
        topic,
        opponentArgument: lastAgainstArg,
        round,
      });

      client.send(
        JSON.stringify({
          type: "argument",
          debateId: debate.id,
          side: "for",
          argument: forArg,
          round,
          debaterName: "Aristotle",
        }),
      );

      // AGAINST side argues
      const againstArg = await this.debaterAgainst.argue({
        topic,
        opponentArgument: forArg,
        round,
      });

      client.send(
        JSON.stringify({
          type: "argument",
          debateId: debate.id,
          side: "against",
          argument: againstArg,
          round,
          debaterName: "Socrates",
        }),
      );

      lastAgainstArg = againstArg;

      // Judge scores the round
      const score = await this.judge.scoreRound({
        topic,
        forArgument: forArg,
        againstArgument: againstArg,
        round,
      });

      const roundData: DebateRound = {
        forArg,
        againstArg,
        forScore: score.forScore,
        againstScore: score.againstScore,
        commentary: score.commentary,
      };
      debate.rounds.push(roundData);

      client.send(
        JSON.stringify({
          type: "score",
          debateId: debate.id,
          round,
          forScore: score.forScore,
          againstScore: score.againstScore,
          commentary: score.commentary,
        }),
      );
    }

    // Final verdict
    const verdict = await this.judge.finalVerdict({
      topic,
      rounds: debate.rounds,
    });

    debate.verdict = verdict;
    debate.status = "done";

    client.send(
      JSON.stringify({
        type: "verdict",
        debateId: debate.id,
        verdict,
        totalForScore: debate.rounds.reduce((s, r) => s + r.forScore, 0),
        totalAgainstScore: debate.rounds.reduce((s, r) => s + r.againstScore, 0),
      }),
    );
  }

  @Tool({ description: "Get the number of debates held" })
  async getDebateCount(): Promise<number> {
    return this.debates.length;
  }
}
