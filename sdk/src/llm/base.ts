import 'reflect-metadata';
import { z } from 'zod';
import { BaseEntity } from '../entity/types.js';
import { getDescribeMethod, getEntityMeta } from '../entity/decorators/index.js';
import { getRegistry } from '../registry.js';
import { LLMContext } from './context.js';
import { EntityStreamImpl } from '../entity/stream/index.js';
import type { EntityStream } from '../entity/stream/index.js';
import type { ToolOptions } from './decorators.js';
import type { LLMExecutionTriggerParams } from './trigger.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage, AIMessageChunk } from '@langchain/core/messages';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

const LLM_EXECUTOR_KEY = Symbol.for('llm:executor');
const LLM_TOOL_KEY = Symbol.for('llm:tools');

/** Look up the Zod input schema for a method from the codegen registry. */
function getMethodSchema(entityType: string, methodName: string): any {
  const registry = getRegistry();
  if (!registry?.entities) return null;
  const entity = registry.entities[entityType];
  if (!entity?.methods) return null;
  const method = entity.methods[`${entityType}.${methodName}`];
  return method?.input ?? null;
}

/** Payload emitted on the toolCall stream */
export interface ToolCallEvent {
  tool: string;
  args: unknown;
  result: string;
}

/**
 * Base class for LLM-powered entities.
 * Provides invoke(), context, and observable streams.
 */
export abstract class LLMEntity extends BaseEntity {
  protected context = new LLMContext();
  readonly response: EntityStream<string> = new EntityStreamImpl<string>();
  readonly toolCall: EntityStream<ToolCallEvent> = new EntityStreamImpl<ToolCallEvent>();

  /** Prevents overlapping tick/external triggers from calling invoke() while one is already running. */
  private _invokeRunning = false;
  private _pendingMessages: string[] = [];

  async invoke(params: LLMExecutionTriggerParams): Promise<string> {
    if (this._invokeRunning) {
      // Re-entrant call (e.g. hear() triggered by a tool call inside an active invoke).
      // Don't run an LLM loop — that would corrupt the shared context by inserting
      // messages before the outer invoke finishes adding tool results.
      // Buffer the message so the next invoke sees it.
      this._pendingMessages.push(params.message);
      return '';
    }

    this._invokeRunning = true;
    try {
      return await this._invokeInner(params);
    } finally {
      this._invokeRunning = false;
    }
  }

  private async _invokeInner(params: LLMExecutionTriggerParams): Promise<string> {
    const entityCtor = this.constructor;
    const executorProp: string | undefined = Reflect.getOwnMetadata(LLM_EXECUTOR_KEY, entityCtor);
    const toolMeta: Map<string, ToolOptions> = Reflect.getOwnMetadata(LLM_TOOL_KEY, entityCtor) ?? new Map();

    const context = this.context;
    const model: BaseChatModel | null = executorProp ? (this as any)[executorProp] : null;
    if (!model) throw new Error('LLMEntity requires an @Executor() property with a LangChain BaseChatModel instance');

    const entity = this as any;
    const tools: Array<{ name: string; description: string; schema: any; invoke: (a: any) => Promise<string> }> = [];

    const entityType = getEntityMeta(entityCtor as any)?.type;

    // Own @Tool methods
    for (const [methodName, opts] of toolMeta.entries()) {
      const schema = (entityType && getMethodSchema(entityType, methodName)) ?? z.object({});
      tools.push({
        name: opts.name ?? methodName,
        description: opts.description,
        schema,
        async invoke(toolArgs: any) {
          const fn = entity[methodName];
          if (typeof fn !== 'function') throw new Error(`Tool "${methodName}" not found`);
          const result = await fn.call(entity, toolArgs);
          const resultStr = result == null ? '' : typeof result === 'string' ? result : JSON.stringify(result);
          entity.toolCall.emit({ tool: opts.name ?? methodName, args: toolArgs, result: resultStr });
          return resultStr;
        },
      });
    }

    // Visible refs/components — collect their @Tool methods as namespaced tools
    for (const propName of Object.getOwnPropertyNames(this)) {
      const child = entity[propName];
      if (!child || typeof child !== 'object' || !('id' in child)) continue;
      if (child === this) continue;

      const childCtor = child.constructor;
      const childTools: Map<string, ToolOptions> = Reflect.getOwnMetadata(LLM_TOOL_KEY, childCtor) ?? new Map();

      const childEntityType = getEntityMeta(childCtor)?.type;

      for (const [childMethod, childOpts] of childTools.entries()) {
        const fullToolName = `${propName}_${childOpts.name ?? childMethod}`;
        const childSchema = (childEntityType && getMethodSchema(childEntityType, childMethod)) ?? z.object({});
        tools.push({
          name: fullToolName,
          description: childOpts.description,
          schema: childSchema,
          async invoke(toolArgs: any) {
            const fn = child[childMethod];
            if (typeof fn !== 'function') throw new Error(`Tool "${propName}.${childMethod}" not found`);
            const result = await fn.call(child, toolArgs);
            const resultStr = result == null ? '' : typeof result === 'string' ? result : JSON.stringify(result);
            entity.toolCall.emit({ tool: fullToolName, args: toolArgs, result: resultStr });
            return resultStr;
          },
        });
      }
    }

    // Compose system prompt from @Describe
    const promptParts: string[] = [];
    const ownDescribe = getDescribeMethod(entityCtor as any);
    if (ownDescribe && typeof entity[ownDescribe] === 'function') {
      const desc = entity[ownDescribe]();
      if (desc) promptParts.push(desc);
    }
    for (const propName of Object.getOwnPropertyNames(this)) {
      const child = entity[propName];
      if (!child || typeof child !== 'object' || !('id' in child) || child === this) continue;
      const childDescribe = getDescribeMethod(child.constructor);
      if (childDescribe && typeof child[childDescribe] === 'function') {
        const desc = child[childDescribe]();
        if (desc) promptParts.push(`[${propName}] ${desc}`);
      }
    }
    if (promptParts.length > 0) context.setSystemPrompt(promptParts.join('\n\n'));

    // Bind tools + add user message (drain any buffered messages from re-entrant calls first)
    const llmWithTools = typeof model.bindTools === 'function' && tools.length > 0
      ? model.bindTools(tools) : model;
    for (const pending of this._pendingMessages) {
      context.addUser(pending);
    }
    this._pendingMessages = [];
    context.addUser(params.message);

    function toMessages(ctx: LLMContext): BaseMessage[] {
      return ctx.getMessages().map((m) => {
        switch (m.role) {
          case 'system': return new SystemMessage(m.content);
          case 'user': return new HumanMessage(m.content);
          case 'assistant': {
            const tc = m.toolCalls?.map(c => ({ id: c.id, name: c.name, args: c.args, type: 'tool_call' as const }));
            return new AIMessage({ content: m.content, tool_calls: tc ?? [] });
          }
          case 'tool': return new ToolMessage({ content: m.content, tool_call_id: m.toolCallId ?? '' });
          default: return new HumanMessage(m.content);
        }
      });
    }

    const MAX_ITERATIONS = 10;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const llmResponse: AIMessageChunk = await llmWithTools.invoke(toMessages(context));
      const toolCalls = llmResponse.tool_calls ?? [];
      const content = typeof llmResponse.content === 'string'
        ? llmResponse.content
        : Array.isArray(llmResponse.content)
          ? llmResponse.content.map((b: any) => b.text ?? '').join('')
          : String(llmResponse.content ?? '');

      if (toolCalls.length === 0) {
        context.addAssistant(content);
        this.response.emit(content);
        return content;
      }

      context.addMessage({
        role: 'assistant', content: content || '',
        toolCalls: toolCalls.map(c => ({ id: c.id ?? `call_${i}_${c.name}`, name: c.name, args: c.args as Record<string, unknown> })),
      });

      for (const call of toolCalls) {
        const toolCallId = call.id ?? `call_${i}_${call.name}`;
        const tool = tools.find(t => t.name === call.name);
        if (!tool) { context.addToolResult(toolCallId, `Error: tool "${call.name}" not found`); continue; }
        try {
          context.addToolResult(toolCallId, await tool.invoke(call.args));
        } catch (err: any) {
          context.addToolResult(toolCallId, `Error: ${err.message}`);
        }
      }
    }

    throw new Error('LLM execution loop exceeded max iterations');
  }
}
