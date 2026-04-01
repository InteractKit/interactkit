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
import { Player } from "./player.js";

interface Client {
  send: (msg: string) => void;
  _pinned: unknown;
}

interface LogEntry {
  phase: string;
  round: number;
  text: string;
}

const NAMES = ["Elena", "Marcus", "Sofia", "Dmitri", "Aria", "Jasper"];
const PERSONALITIES = [
  "analytical and methodical",
  "passionate and outspoken",
  "quiet but observant",
  "charming and persuasive",
  "nervous and suspicious",
  "bold and confrontational",
];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

@Entity({ description: "Werewolf game master — orchestrates a social deduction game" })
export class Game extends BaseEntity {
  @Component() private player1!: Remote<Player>;
  @Component() private player2!: Remote<Player>;
  @Component() private player3!: Remote<Player>;
  @Component() private player4!: Remote<Player>;
  @Component() private player5!: Remote<Player>;
  @Component() private player6!: Remote<Player>;

  @State({ description: "Current game phase" })
  private phase = "waiting";

  @State({ description: "Current round number" })
  private round = 0;

  @State({ description: "Chronological game log" })
  private gameLog: LogEntry[] = [];

  @State({ description: "Name of the human player (empty = spectator only)" })
  private humanPlayerName = "";

  @State({ description: "Role assigned to the human player" })
  private humanPlayerRole = "";

  // Not persisted
  private clients = new Map<string, Client>();
  private playerByName: Record<string, Remote<Player>> = {};
  private pendingInput: { resolve: (data: any) => void } | null = null;

  private get allPlayers(): Remote<Player>[] {
    return [
      this.player1 as unknown as Remote<Player>,
      this.player2 as unknown as Remote<Player>,
      this.player3 as unknown as Remote<Player>,
      this.player4 as unknown as Remote<Player>,
      this.player5 as unknown as Remote<Player>,
      this.player6 as unknown as Remote<Player>,
    ];
  }

  private getPlayer(name: string): Remote<Player> | null {
    return this.playerByName[name] ?? null;
  }

  private isHuman(name: string): boolean {
    return name === this.humanPlayerName;
  }

  // --- Wait for human input via WS ---

  private waitForHumanInput<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
    this.broadcast({ type: "awaiting_input", action, ...data });
    return new Promise<T>((resolve) => {
      this.pendingInput = { resolve };
    });
  }


  // --- Hooks ---

  @Hook(Init.Runner())
  async onInit(_input: Init.Input) {
    console.log("\n  [werewolf] Game Master ready");
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
    console.log(`  [werewolf] client connected: ${clientId}`);
  }

  @Hook(WsMessage.Runner({ port: 3001 }))
  async onWsMessage(input: Remote<WsMessage.Input>) {
    const raw = await input.data;
    const clientId = await input.clientId;
    const client = this.clients.get(clientId);
    if (!client) return;

    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      client.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "start": {
        if (this.phase !== "waiting" && this.phase !== "ended") {
          client.send(JSON.stringify({ type: "error", message: "Game already in progress" }));
          return;
        }
        // msg.playerName is optional — if provided, human joins as that slot
        this.startGame(msg.playerName || "").catch((err) => {
          console.error("[werewolf] game error:", err);
          this.broadcast({ type: "error", message: String(err) });
        });
        break;
      }
      case "input": {
        if (this.pendingInput) {
          const { resolve } = this.pendingInput;
          this.pendingInput = null;
          resolve(msg);
        }
        break;
      }
      case "status": {
        const players = await this.getPlayerStatuses();
        client.send(JSON.stringify({
          type: "status",
          phase: this.phase,
          round: this.round,
          humanPlayer: this.humanPlayerName,
          players: players.map((p) => ({
            name: p.name,
            alive: p.alive,
            isHuman: p.name === this.humanPlayerName,
          })),
          log: this.gameLog,
        }));
        break;
      }
      default:
        client.send(JSON.stringify({ type: "error", message: `Unknown type: ${msg.type}` }));
    }
  }

  // --- Game Logic ---

  private async getPlayerStatuses(): Promise<Array<{ name: string; role: string; alive: boolean }>> {
    return Promise.all(this.allPlayers.map((p) => p.getRole()));
  }

  private async getAlivePlayers(): Promise<Array<{ name: string; role: string; player: Remote<Player> }>> {
    const statuses = await this.getPlayerStatuses();
    return statuses
      .filter((s) => s.alive)
      .map((s) => ({ name: s.name, role: s.role, player: this.getPlayer(s.name)! }));
  }

  private log(phase: string, text: string) {
    this.gameLog.push({ phase, round: this.round, text });
  }

  private broadcast(msg: Record<string, unknown>) {
    const data = JSON.stringify(msg);
    console.log(`  [broadcast] ${msg.type} to ${this.clients.size} clients`);
    for (const client of this.clients.values()) {
      try { client.send(data); } catch (err) {
        console.error("  [broadcast] send failed:", err);
      }
    }
  }

  private async startGame(humanName: string) {
    this.phase = "setup";
    this.round = 0;
    this.gameLog = [];
    this.humanPlayerName = "";
    this.humanPlayerRole = "";
    this.playerByName = {};

    const roles = shuffle(["werewolf", "werewolf", "seer", "villager", "villager", "villager"]);
    const players = this.allPlayers;

    // If human wants to play, they take slot 0 (Elena's slot)
    const names = [...NAMES];
    if (humanName) {
      names[0] = humanName;
      this.humanPlayerName = humanName;
      this.humanPlayerRole = roles[0];
    }

    for (let i = 0; i < 6; i++) {
      await players[i].configure({ name: names[i], role: roles[i], personality: PERSONALITIES[i] });
      this.playerByName[names[i]] = players[i];
    }

    // Tell werewolves about each other
    const werewolfNames: string[] = [];
    for (let i = 0; i < 6; i++) {
      if (roles[i] === "werewolf") werewolfNames.push(names[i]);
    }
    for (const wName of werewolfNames) {
      const partner = werewolfNames.find((n) => n !== wName);
      if (partner) {
        await this.getPlayer(wName)!.addKnowledge({
          info: `Your fellow werewolf is ${partner}. Protect them during the day.`,
        });
      }
    }

    this.broadcast({
      type: "narration",
      text: `The village of Ravenhollow has 6 residents: ${names.join(", ")}. Among them lurk 2 werewolves. The seer watches in silence. Night is falling...`,
    });

    // If human is playing, tell them their role privately
    if (this.humanPlayerName) {
      this.broadcast({
        type: "your_role",
        name: this.humanPlayerName,
        role: this.humanPlayerRole,
        personality: PERSONALITIES[0],
      });
    }

    this.log("setup", "Game started. Roles assigned.");

    // Game loop
    while (true) {
      this.round++;

      const nightOk = await this.nightPhase();
      if (!nightOk) break;

      const winAfterNight = await this.checkWinCondition();
      if (winAfterNight) { await this.endGame(winAfterNight); break; }

      await this.dayPhase();

      const winAfterDay = await this.checkWinCondition();
      if (winAfterDay) { await this.endGame(winAfterDay); break; }
    }
  }

  // --- Night Phase ---

  private async nightPhase(): Promise<boolean> {
    this.phase = "night";
    this.broadcast({ type: "phase", phase: "night", round: this.round });
    this.broadcast({
      type: "narration",
      text: `Night ${this.round} falls over Ravenhollow. The village sleeps, but not everyone...`,
    });
    this.log("night", `Night ${this.round} begins.`);

    const alive = await this.getAlivePlayers();
    const aliveNames = alive.map((a) => a.name);
    const werewolves = alive.filter((a) => a.role === "werewolf");
    const seer = alive.find((a) => a.role === "seer");

    if (werewolves.length === 0) return true;

    const nonWerewolfAlive = alive.filter((a) => a.role !== "werewolf").map((a) => a.name);
    const contextSoFar = this.gameLog.slice(-10).map((e) => e.text).join(" ");

    // Werewolves choose target
    const werewolfVotes: Record<string, number> = {};
    for (const ww of werewolves) {
      let target: string;
      if (this.isHuman(ww.name)) {
        const input = await this.waitForHumanInput<{ target: string }>("nightAction", {
          role: "werewolf",
          targets: nonWerewolfAlive,
          message: "Choose a player to kill tonight.",
        });
        target = nonWerewolfAlive.includes(input.target) ? input.target : nonWerewolfAlive[0];
      } else {
        const result = await ww.player.nightAction({
          context: `Night ${this.round}. ${contextSoFar}`,
          targets: nonWerewolfAlive,
        });
        target = result.target;
      }
      werewolfVotes[target] = (werewolfVotes[target] ?? 0) + 1;
    }

    // Resolve kill
    let maxVotes = 0;
    const candidates: string[] = [];
    for (const [name, count] of Object.entries(werewolfVotes)) {
      if (count > maxVotes) { maxVotes = count; candidates.length = 0; candidates.push(name); }
      else if (count === maxVotes) candidates.push(name);
    }
    const killTarget = candidates[Math.floor(Math.random() * candidates.length)];

    // Seer investigates
    if (seer) {
      const seerTargets = aliveNames.filter((n) => n !== seer.name);
      let investigateTarget: string;

      if (this.isHuman(seer.name)) {
        const input = await this.waitForHumanInput<{ target: string }>("nightAction", {
          role: "seer",
          targets: seerTargets,
          message: "Choose a player to investigate.",
        });
        investigateTarget = seerTargets.includes(input.target) ? input.target : seerTargets[0];
      } else {
        const result = await seer.player.nightAction({
          context: `Night ${this.round}. You may investigate one player. ${contextSoFar}`,
          targets: seerTargets,
        });
        investigateTarget = result.target;
      }

      const targetInfo = alive.find((a) => a.name === investigateTarget);
      const isWerewolf = targetInfo?.role === "werewolf";
      const result = isWerewolf ? "werewolf" : "not werewolf";

      await seer.player.addKnowledge({
        info: `Night ${this.round}: I investigated ${investigateTarget} — they are ${result}.`,
      });

      this.broadcast({ type: "investigation", player: seer.name, target: investigateTarget, result });
      this.log("night", `Seer investigated ${investigateTarget}: ${result}.`);
    }

    // Eliminate victim
    const victim = this.getPlayer(killTarget);
    if (victim) {
      await victim.eliminate();
      const victimStatus = await victim.getRole();

      this.broadcast({ type: "elimination", player: killTarget, role: victimStatus.role, method: "werewolf" });
      this.broadcast({
        type: "narration",
        text: `Dawn breaks. The villagers find ${killTarget} dead, mauled beyond recognition. ${killTarget} was a ${victimStatus.role}.`,
      });
      this.log("night", `${killTarget} (${victimStatus.role}) was killed by werewolves.`);

      for (const p of alive) {
        if (p.name !== killTarget) {
          await p.player.addKnowledge({
            info: `Night ${this.round}: ${killTarget} was killed. They were a ${victimStatus.role}.`,
          });
        }
      }
    }

    return true;
  }

  // --- Day Phase ---

  private async dayPhase() {
    this.phase = "day";
    this.broadcast({ type: "phase", phase: "day", round: this.round });
    this.broadcast({
      type: "narration",
      text: `Day ${this.round}. The surviving villagers gather. Fear and suspicion fill the air.`,
    });
    this.log("day", `Day ${this.round} begins.`);

    const alive = await this.getAlivePlayers();
    const aliveNames = alive.map((a) => a.name);
    const contextSoFar = this.gameLog.slice(-15).map((e) => e.text).join(" ");

    // Discussion: all alive players take turns in shuffled rounds.
    // Human gets a blocking prompt on their turn. Anyone can call for a vote.
    this.broadcast({ type: "narration", text: "The discussion begins..." });

    const speeches: string[] = [];
    let voteCalledBy = "";
    const maxRounds = 3;

    for (let dr = 1; dr <= maxRounds && !voteCalledBy; dr++) {
      const speakers = shuffle(alive);

      for (const p of speakers) {
        if (voteCalledBy) break;
        const speechContext = [contextSoFar, ...speeches.slice(-10)].join(" ");

        if (this.isHuman(p.name)) {
          const input = await this.waitForHumanInput<{ text: string }>("discuss", {
            alivePlayers: aliveNames,
            round: dr,
            message: dr === 1
              ? "It's your turn to speak. What do you say?"
              : 'Respond to the discussion. Say "call vote" to end it.',
          });
          const text = input.text || "(stays silent)";
          speeches.push(`${p.name}: "${text}"`);
          this.broadcast({ type: "speech", player: p.name, text, alive: true, isHuman: true });
          this.log("day", `${p.name}: "${text}"`);

          if (text.toLowerCase().includes("call vote") || text.toLowerCase().includes("call for a vote")) {
            voteCalledBy = p.name;
            this.broadcast({ type: "narration", text: `${p.name} calls for a vote!` });
          }
        } else {
          const hint = dr >= 2
            ? `\n\nIf ready to vote, say "I CALL FOR A VOTE." at the start. Otherwise keep arguing.`
            : "";
          const speech = await p.player.discuss({
            context: speechContext + hint,
            alivePlayers: aliveNames,
          });
          speeches.push(`${p.name}: "${speech}"`);
          this.broadcast({ type: "speech", player: p.name, text: speech, alive: true, isHuman: false });
          this.log("day", `${p.name}: "${speech}"`);

          if (speech.toUpperCase().includes("I CALL FOR A VOTE")) {
            voteCalledBy = p.name;
            this.broadcast({ type: "narration", text: `${p.name} calls for a vote!` });
          }
        }
      }
    }

    if (!voteCalledBy) {
      this.broadcast({ type: "narration", text: "The village has discussed enough. Time to vote." });
    }

    // Voting
    this.broadcast({ type: "narration", text: "The village votes..." });
    const fullContext = [contextSoFar, ...speeches].join(" ");
    const voteTally: Record<string, number> = {};

    for (const p of alive) {
      const otherPlayers = aliveNames.filter((n) => n !== p.name);
      let target: string;
      let reason: string;

      if (this.isHuman(p.name)) {
        const input = await this.waitForHumanInput<{ target: string; reason?: string }>("vote", {
          targets: otherPlayers,
          message: "Vote to eliminate a player.",
        });
        target = otherPlayers.includes(input.target) ? input.target : otherPlayers[0];
        reason = input.reason || "No comment.";
      } else {
        const result = await p.player.vote({ context: fullContext, alivePlayers: aliveNames });
        target = result.target;
        reason = result.reason;
      }

      voteTally[target] = (voteTally[target] ?? 0) + 1;
      this.broadcast({ type: "vote", player: p.name, target, reason });
      this.log("day", `${p.name} voted for ${target}: ${reason}`);
    }

    // Tally and eliminate
    let maxVotes = 0;
    const candidates: string[] = [];
    for (const [name, count] of Object.entries(voteTally)) {
      if (count > maxVotes) { maxVotes = count; candidates.length = 0; candidates.push(name); }
      else if (count === maxVotes) candidates.push(name);
    }
    const eliminated = candidates[Math.floor(Math.random() * candidates.length)];
    const eliminatedPlayer = this.getPlayer(eliminated);

    if (eliminatedPlayer) {
      await eliminatedPlayer.eliminate();
      const status = await eliminatedPlayer.getRole();

      this.broadcast({ type: "elimination", player: eliminated, role: status.role, method: "vote" });
      this.broadcast({
        type: "narration",
        text: `The village has spoken. ${eliminated} is eliminated. They were a ${status.role}.`,
      });
      this.log("day", `${eliminated} (${status.role}) eliminated by vote.`);

      const stillAlive = await this.getAlivePlayers();
      for (const p of stillAlive) {
        await p.player.addKnowledge({
          info: `Day ${this.round}: ${eliminated} was voted out. They were a ${status.role}.`,
        });
      }
    }
  }

  // --- Win Condition ---

  private async checkWinCondition(): Promise<{ winner: string; message: string } | null> {
    const alive = await this.getAlivePlayers();
    const werewolves = alive.filter((a) => a.role === "werewolf");
    const villagers = alive.filter((a) => a.role !== "werewolf");

    if (werewolves.length === 0) {
      return { winner: "village", message: "All werewolves have been eliminated! The village is safe." };
    }
    if (werewolves.length >= villagers.length) {
      return { winner: "werewolves", message: "The werewolves outnumber the villagers. Darkness descends forever." };
    }
    return null;
  }

  private async endGame(result: { winner: string; message: string }) {
    this.phase = "ended";
    this.broadcast({ type: "phase", phase: "ended", round: this.round });
    this.broadcast({ type: "result", winner: result.winner, message: result.message });

    const allStatuses = await this.getPlayerStatuses();
    this.broadcast({
      type: "roles",
      players: allStatuses.map((s) => ({
        name: s.name,
        role: s.role,
        alive: s.alive,
        isHuman: s.name === this.humanPlayerName,
      })),
    });

    this.log("ended", `Game over. ${result.winner} wins! ${result.message}`);
    this.broadcast({ type: "narration", text: `Game over! ${result.message}` });
  }

  @Tool({ description: "Get current game status" })
  async getStatus(): Promise<{ phase: string; round: number; logLength: number }> {
    return { phase: this.phase, round: this.round, logLength: this.gameLog.length };
  }
}
