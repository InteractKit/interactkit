import { BaseEntity } from '../entity/types.js';
import { Entity } from '../entity/decorators/index.js';
import { LLMContext } from './context.js';
import type { LLMContextOptions, LLMMessage } from './context.js';

/**
 * Entity wrapper around LLMContext for shared conversation history.
 * Use as a @Component on a parent and @Ref from multiple LLMEntity siblings.
 *
 * Implements the same interface as LLMContext so LLMEntity.invoke() works transparently.
 */
@Entity({ description: 'Shared LLM conversation history' })
export class ConversationContext extends BaseEntity {
  private _ctx: LLMContext;

  constructor() {
    super();
    this._ctx = new LLMContext();
  }

  /** Configure context options. Call from parent's @Hook(Init.Runner()). */
  configure(options: LLMContextOptions): void {
    this._ctx = new LLMContext(options);
  }

  setSystemPrompt(prompt: string): void {
    this._ctx.setSystemPrompt(prompt);
  }

  getSystemPrompt(): string {
    return this._ctx.getSystemPrompt();
  }

  addMessage(message: LLMMessage): void {
    this._ctx.addMessage(message);
  }

  addUser(content: string): void {
    this._ctx.addUser(content);
  }

  addAssistant(content: string): void {
    this._ctx.addAssistant(content);
  }

  addToolResult(toolCallId: string, content: string): void {
    this._ctx.addToolResult(toolCallId, content);
  }

  getMessages(): LLMMessage[] {
    return this._ctx.getMessages();
  }

  getHistory(): LLMMessage[] {
    return this._ctx.getHistory();
  }

  clear(): void {
    this._ctx.clear();
  }

  get length(): number {
    return this._ctx.length;
  }
}
