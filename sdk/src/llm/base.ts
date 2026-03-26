import 'reflect-metadata';
import { z } from 'zod';
import { BaseEntity } from '../entity/types.js';
import { getEntityMeta, getDescribeMethod } from '../entity/decorators.js';
import { getRegistry } from '../registry.js';
import { LLMContext } from './context.js';
import { EntityStreamImpl } from '../entity/stream.js';
import type { EntityStream } from '../entity/stream.js';
import type { ToolOptions } from './decorators.js';
import type { LLMExecutionTriggerParams } from './trigger.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage, AIMessageChunk } from '@langchain/core/messages';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

const LLM_EXECUTOR_KEY = Symbol.for('llm:executor');
const LLM_TOOL_KEY = Symbol.for('llm:tools');

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
  /** Conversation history. Override with a configured LLMContext for custom behavior. */
  protected context = new LLMContext();

  /** Emits each final LLM response */
  readonly response: EntityStream<string> = new EntityStreamImpl<string>();

  /** Emits each tool call with args and result */
  readonly toolCall: EntityStream<ToolCallEvent> = new EntityStreamImpl<ToolCallEvent>();

  /**
   * Send a message to the LLM and get a response.
   * Uses this.context for conversation history, @Executor for the model,
   * and all @Tool methods + ref tools as available tools.
   */
  async invoke(params: LLMExecutionTriggerParams): Promise<string> {
    const entityCtor = this.constructor;
    const executorProp = Reflect.getOwnMetadata(LLM_EXECUTOR_KEY, entityCtor);
    const toolMeta: Map<string, ToolOptions> =
      Reflect.getOwnMetadata(LLM_TOOL_KEY, entityCtor) ?? new Map();

    const context = this.context;
    const model: BaseChatModel | null = executorProp ? (this as any)[executorProp] : null;

    if (!model) throw new Error('LLMEntity requires an @Executor() property with a LangChain BaseChatModel instance');

    // Build tool list from own @Tool methods
    const entity = this as any;
    const responseStream = this.response;
    const toolCallStream = this.toolCall;
    const tools: Array<{ name: string; description: string; schema: any; invoke: (args: any) => Promise<string> }> = [];

    // Look up Zod schemas from the registry
    const registry = getRegistry();
    const entityMeta = getEntityMeta(entityCtor as any);
    const entityType = entityMeta?.type;
    const entityReg = entityType ? registry?.entities?.[entityType] : undefined;

    for (const [methodName, opts] of toolMeta.entries()) {
      const methodKey = `${entityType}.${methodName}`;
      const methodReg = entityReg?.methods?.[methodKey];
      tools.push({
        name: opts.name ?? methodName,
        description: opts.description,
        schema: methodReg?.input ?? z.object({}),
        async invoke(args: any) {
          const fn = entity[methodName];
          if (typeof fn !== 'function') throw new Error(`Tool "${methodName}" not found`);
          const result = await fn.call(entity, args);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          toolCallStream.emit({ tool: opts.name ?? methodName, args, result: resultStr });
          return resultStr;
        },
      });
    }

    // Expand all refs/components — in LLMEntity, all are visible to the LLM by default
    const allRefs: string[] = entityReg?.refs ?? [];
    const allComponents: string[] = (entityReg?.components ?? []).map((c: any) => c.property);
    const visibleProps = new Set([...allRefs, ...allComponents]);
    for (const propName of visibleProps) {
      const child = entity[propName];
      if (!child || typeof child !== 'object') continue;

      let childEntityType: string | undefined;
      // Try proxy's __entityType first (works for both component and ref proxies)
      if (child.__entityType) {
        childEntityType = child.__entityType;
      } else {
        const childCtor = child.constructor;
        const childMeta = getEntityMeta(childCtor);
        if (childMeta) {
          childEntityType = childMeta.type;
        }
      }

      const childCtor = child.constructor;
      let childTools: Map<string, ToolOptions> = Reflect.getOwnMetadata(LLM_TOOL_KEY, childCtor) ?? new Map();
      const childReg = childEntityType ? registry?.entities?.[childEntityType] : undefined;

      if (childTools.size === 0 && childReg?.methods) {
        for (const [eventName] of Object.entries(childReg.methods) as [string, any][]) {
          const methodName = eventName.split('.').pop()!;
          childTools.set(methodName, { description: methodName, name: methodName });
        }
      }

      for (const [childMethod, childOpts] of childTools.entries()) {
        const childMethodKey = `${childEntityType}.${childMethod}`;
        const childMethodReg = childReg?.methods?.[childMethodKey];
        const fullToolName = `${propName}_${childOpts.name ?? childMethod}`;
        tools.push({
          name: fullToolName,
          description: childOpts.description,
          schema: childMethodReg?.input ?? z.object({}),
          async invoke(args: any) {
            const fn = child[childMethod];
            if (typeof fn !== 'function') throw new Error(`Tool "${propName}.${childMethod}" not found`);
            const result = await fn.call(child, args);
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            toolCallStream.emit({ tool: fullToolName, args, result: resultStr });
            return resultStr;
          },
        });
      }
    }

    // Auto-compose system prompt from @Describe methods (self + visible refs/components)
    const promptParts: string[] = [];
    const ownDescribe = getDescribeMethod(entityCtor as any);
    if (ownDescribe && typeof entity[ownDescribe] === 'function') {
      const desc = entity[ownDescribe]();
      if (desc) promptParts.push(desc);
    }
    for (const propName of visibleProps) {
      const child = entity[propName];
      if (!child || typeof child !== 'object') continue;

      let desc: string | undefined;

      // If proxy, call describe() through the event bus (async)
      if (child.__entityType && typeof child.describe === 'function') {
        try {
          const result = await child.describe();
          if (typeof result === 'string') desc = result;
        } catch { /* describe not registered as tool — skip */ }
      } else {
        // Raw instance — call directly
        const childCtor2 = child.constructor;
        const childDescribe = getDescribeMethod(childCtor2);
        if (childDescribe && typeof child[childDescribe] === 'function') {
          desc = child[childDescribe]();
        }
      }

      if (desc) promptParts.push(`[${propName}] ${desc}`);
    }
    if (promptParts.length > 0) {
      context.setSystemPrompt(promptParts.join('\n\n'));
    }

    // Bind tools to model
    const llmWithTools = typeof model.bindTools === 'function' && tools.length > 0
      ? model.bindTools(tools)
      : model;

    // Add user message to context
    context.addUser(params.message);

    // Build LangChain message array from context
    function toMessages(ctx: LLMContext): BaseMessage[] {
      return ctx.getMessages().map((m) => {
        switch (m.role) {
          case 'system':
            return new SystemMessage(m.content);
          case 'user':
            return new HumanMessage(m.content);
          case 'assistant': {
            const toolCalls = m.toolCalls?.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: tc.args,
              type: 'tool_call' as const,
            }));
            return new AIMessage({
              content: m.content,
              tool_calls: toolCalls ?? [],
            });
          }
          case 'tool':
            return new ToolMessage({
              content: m.content,
              tool_call_id: m.toolCallId ?? '',
            });
          default:
            return new HumanMessage(m.content);
        }
      });
    }

    // Execution loop
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
        responseStream.emit(content);
        return content;
      }

      context.addMessage({
        role: 'assistant',
        content: content || '',
        toolCalls: toolCalls.map((c) => ({
          id: c.id ?? `call_${i}_${c.name}`,
          name: c.name,
          args: c.args as Record<string, unknown>,
        })),
      });

      for (const call of toolCalls) {
        const toolName = call.name;
        const toolArgs = call.args;
        const toolCallId = call.id ?? `call_${i}_${toolName}`;

        const tool = tools.find(t => t.name === toolName);
        if (!tool) {
          context.addToolResult(toolCallId, `Error: tool "${toolName}" not found`);
          continue;
        }

        try {
          const result = await tool.invoke(toolArgs);
          context.addToolResult(toolCallId, result);
        } catch (err: any) {
          context.addToolResult(toolCallId, `Error: ${err.message}`);
        }
      }
    }

    throw new Error('LLM execution loop exceeded max iterations');
  }
}
