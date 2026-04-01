import {
  Entity,
  LLMEntity,
  Executor,
  State,
  Tool,
  Describe,
  Component,
  type Remote,
} from "@interactkit/sdk";
import { ChatOpenAI } from "@langchain/openai";
import { PlayerMemory } from "./player-memory.js";

@Entity({ description: "A player in the Werewolf game" })
export class Player extends LLMEntity {
  @Executor()
  private llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  @Component()
  private memory!: Remote<PlayerMemory>;

  @State({ description: "Player display name" })
  private name = "Villager";

  @State({ description: "Secret role: werewolf, seer, or villager" })
  private role = "villager";

  @State({ description: "Personality trait that shapes behavior" })
  private personality = "cautious";

  @State({ description: "Whether this player is still alive" })
  private alive = true;

  @State({ description: "Known information from investigations or werewolf knowledge" })
  private knownInfo: string[] = [];

  @Describe()
  describe() {
    const status = this.alive ? "alive" : "dead";
    const info = this.knownInfo.length > 0
      ? `Known info: ${this.knownInfo.join("; ")}`
      : "No special knowledge.";
    return [
      `You are ${this.name}, a ${this.role} in a game of Werewolf. Status: ${status}.`,
      `Personality: ${this.personality}.`,
      info,
    ].join(" ");
  }

  // --- External tools (called by GameMaster) ---

  @Tool({ description: "Set up this player's identity and role" })
  async configure(input: {
    name: string;
    role: string;
    personality: string;
  }): Promise<void> {
    this.name = input.name;
    this.role = input.role;
    this.personality = input.personality;
    this.alive = true;
    this.knownInfo = [];
    await this.memory.add({
      text: `I am ${input.name}, a ${input.role}. My personality is ${input.personality}.`,
    });
  }

  @Tool({ description: "Get this player's role information" })
  async getRole(): Promise<{ name: string; role: string; alive: boolean }> {
    return { name: this.name, role: this.role, alive: this.alive };
  }

  @Tool({ description: "Eliminate this player from the game" })
  async eliminate(): Promise<void> {
    this.alive = false;
    await this.memory.add({ text: `I have been eliminated from the game.` });
  }

  @Tool({ description: "Give this player a piece of knowledge" })
  async addKnowledge(input: { info: string }): Promise<void> {
    this.knownInfo.push(input.info);
    await this.memory.add({ text: input.info });
  }

  // --- Tools that invoke the LLM (called by GameMaster, NOT llmCallable) ---

  @Tool({ description: "Player speaks during the day discussion phase" })
  async discuss(input: {
    context: string;
    alivePlayers: string[];
  }): Promise<string> {
    const recentMemories = await this.memory.getRecent({ count: 10 });
    const memoryText = recentMemories.length > 0
      ? `\nYour recent memories:\n${recentMemories.map((m) => `- ${m}`).join("\n")}`
      : "";

    const roleHint = this.role === "werewolf"
      ? `You are secretly a werewolf. Act innocent. Subtly cast doubt on others. NEVER admit you're a werewolf.`
      : this.role === "seer"
        ? `You are the seer. Be careful about revealing your investigations — it makes you a target.`
        : `You are a villager. Try to spot suspicious behavior.`;

    const message = [
      `You are ${this.name}, a ${this.role} in Werewolf. Personality: ${this.personality}.`,
      `Alive: ${input.alivePlayers.join(", ")}`,
      ``,
      input.context,
      memoryText,
      ``,
      roleHint,
      ``,
      `Respond as ${this.name} in a casual, natural way — like you're actually talking in a village meeting.`,
      `1-2 short sentences. No quotes around your speech. Don't be formal or essay-like.`,
      `React to what others said. Be specific — name names, reference events.`,
      `ONLY state facts you actually know. Don't make up information.`,
    ].join("\n");

    const response = await this.invoke({ message });
    await this.memory.add({ text: `Day discussion — I said: "${response}"` });
    return response;
  }

  @Tool({ description: "Player votes to eliminate someone during the day" })
  async vote(input: {
    context: string;
    alivePlayers: string[];
  }): Promise<{ target: string; reason: string }> {
    const recentMemories = await this.memory.getRecent({ count: 10 });
    const memoryText = recentMemories.length > 0
      ? `\nYour recent memories:\n${recentMemories.map((m) => `- ${m}`).join("\n")}`
      : "";

    const otherPlayers = input.alivePlayers.filter((p) => p !== this.name);

    const roleHint = this.role === "werewolf"
      ? `Vote for a villager. Protect your fellow werewolf. Target the seer if you suspect who it is.`
      : this.role === "seer"
        ? `Use your investigation results to guide your vote.`
        : `Vote for whoever seems most suspicious based on the discussion.`;

    const message = [
      `You are ${this.name}, a ${this.role}. ${roleHint}`,
      `Choose ONE from: ${otherPlayers.join(", ")}. Do NOT vote for yourself.`,
      ``,
      input.context,
      memoryText,
      ``,
      `Respond with ONLY this JSON: { "target": "name", "reason": "one short sentence" }`,
    ].join("\n");

    const response = await this.invoke({ message });
    await this.memory.add({ text: `I voted in the day phase.` });

    try {
      const parsed = JSON.parse(response);
      const target = parsed.target ?? otherPlayers[0];
      // Validate target is in the alive players list
      const validTarget = otherPlayers.includes(target) ? target : otherPlayers[0];
      return {
        target: validTarget,
        reason: parsed.reason ?? "No particular reason.",
      };
    } catch {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          const target = parsed.target ?? otherPlayers[0];
          const validTarget = otherPlayers.includes(target) ? target : otherPlayers[0];
          return {
            target: validTarget,
            reason: parsed.reason ?? "No particular reason.",
          };
        } catch {
          // fallthrough
        }
      }
      return { target: otherPlayers[0], reason: "Could not decide." };
    }
  }

  @Tool({ description: "Player performs their night action (werewolf kill / seer investigate)" })
  async nightAction(input: {
    context: string;
    targets: string[];
  }): Promise<{ target: string }> {
    const roleInstructions =
      this.role === "werewolf"
        ? `You are a werewolf. Choose a player to kill tonight. Pick someone who might be the seer or who is suspicious of werewolves.`
        : this.role === "seer"
          ? `You are the seer. Choose a player to investigate tonight. You will learn if they are a werewolf or not.`
          : `You have no night action.`;

    const message = [
      `You are ${this.name}, a ${this.role} in Werewolf.`,
      ``,
      `Context: ${input.context}`,
      ``,
      roleInstructions,
      `Available targets: ${input.targets.join(", ")}`,
      ``,
      `Respond with JSON only: { "target": "player_name" }`,
    ].join("\n");

    const response = await this.invoke({ message });

    try {
      const parsed = JSON.parse(response);
      const target = parsed.target ?? input.targets[0];
      const validTarget = input.targets.includes(target) ? target : input.targets[0];
      return { target: validTarget };
    } catch {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          const target = parsed.target ?? input.targets[0];
          const validTarget = input.targets.includes(target) ? target : input.targets[0];
          return { target: validTarget };
        } catch {
          // fallthrough
        }
      }
      return { target: input.targets[0] };
    }
  }
}
