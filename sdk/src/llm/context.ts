/**
 * LLMContext — manages conversation state for an LLM-powered entity.
 * Injected by the runtime into properties decorated with @LLMContext().
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

export interface LLMContextOptions {
  systemPrompt?: string;
  maxHistory?: number;
}

export class LLMContext {
  private messages: LLMMessage[] = [];
  private systemPrompt: string;
  private maxHistory: number;

  constructor(options: LLMContextOptions = {}) {
    this.systemPrompt = options.systemPrompt ?? '';
    this.maxHistory = options.maxHistory ?? 50;
  }

  /** Set/update the system prompt */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /** Get the system prompt */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /** Add a message to the conversation */
  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    // Trim to maxHistory (keep system prompt separate)
    if (this.messages.length > this.maxHistory) {
      this.messages = this.messages.slice(-this.maxHistory);
    }
  }

  /** Add a user message */
  addUser(content: string): void {
    this.addMessage({ role: 'user', content });
  }

  /** Add an assistant message */
  addAssistant(content: string): void {
    this.addMessage({ role: 'assistant', content });
  }

  /** Add a tool result */
  addToolResult(toolCallId: string, content: string): void {
    this.addMessage({ role: 'tool', content, toolCallId });
  }

  /** Get full message array for LLM call (system + history) */
  getMessages(): LLMMessage[] {
    const result: LLMMessage[] = [];
    if (this.systemPrompt) {
      result.push({ role: 'system', content: this.systemPrompt });
    }
    result.push(...this.messages);
    return result;
  }

  /** Get just the conversation history (no system prompt) */
  getHistory(): LLMMessage[] {
    return [...this.messages];
  }

  /** Clear conversation history */
  clear(): void {
    this.messages = [];
  }

  /** Number of messages in history */
  get length(): number {
    return this.messages.length;
  }
}
