import "reflect-metadata";
import { getDescribeMethod } from "../entity/decorators/index.js";
import { LLMContext } from "./context.js";
import type { AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const LLM_EXECUTOR_KEY = Symbol.for("llm:executor");

/** Resolved tool descriptor used by the LLM loop. */
export interface ResolvedTool {
  name: string;
  description: string;
  schema: any;
  invoke: (a: any) => Promise<string>;
}

/** Serialize a tool return value to a string. */
export function toResultString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Extract text content from an AIMessageChunk, normalizing all formats. */
export function extractContent(response: AIMessageChunk): string {
  if (typeof response.content === "string") return response.content;
  if (Array.isArray(response.content))
    return response.content.map((b: any) => b.text ?? "").join("");
  return String(response.content ?? "");
}

/** Build a system prompt by collecting @Describe() output from entity and its children. */
export function buildSystemPrompt(entity: any): string | null {
  const entityCtor = entity.constructor;
  const parts: string[] = [];

  const ownDescribe = getDescribeMethod(entityCtor);
  if (ownDescribe && typeof entity[ownDescribe] === "function") {
    const desc = entity[ownDescribe]();
    if (desc) parts.push(desc);
  }

  for (const propName of Object.getOwnPropertyNames(entity)) {
    const child = entity[propName];
    if (!child || typeof child !== "object" || !("id" in child) || child === entity)
      continue;
    const childDescribe = getDescribeMethod(child.constructor);
    if (childDescribe && typeof child[childDescribe] === "function") {
      const desc = child[childDescribe]();
      if (desc) parts.push(`[${propName}] ${desc}`);
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Get the BaseChatModel from the @Executor() property on the entity. */
export function getExecutorModel(entity: any): BaseChatModel | null {
  const executorProp: string | undefined = Reflect.getOwnMetadata(
    LLM_EXECUTOR_KEY,
    entity.constructor,
  );
  return executorProp ? entity[executorProp] : null;
}

/** Convert LLMContext messages to LangChain BaseMessage[]. */
export function toLangChainMessages(ctx: LLMContext): BaseMessage[] {
  return ctx.getMessages().map((m) => {
    switch (m.role) {
      case "system":
        return new SystemMessage(m.content);
      case "user":
        return new HumanMessage(m.content);
      case "assistant": {
        const tc = m.toolCalls?.map((c) => ({
          id: c.id,
          name: c.name,
          args: c.args,
          type: "tool_call" as const,
        }));
        return new AIMessage({ content: m.content, tool_calls: tc ?? [] });
      }
      case "tool":
        return new ToolMessage({
          content: m.content,
          tool_call_id: m.toolCallId ?? "",
        });
      default:
        return new HumanMessage(m.content);
    }
  });
}

/** Process tool calls from an LLM response: execute each tool and add results to context. */
export async function processToolCalls(
  toolCalls: Array<{ id?: string; name: string; args: any }>,
  tools: ResolvedTool[],
  context: LLMContext,
  iterIndex: number,
  onToolResult?: (tool: string, args: unknown, result: string) => void,
): Promise<void> {
  for (const call of toolCalls) {
    const toolCallId = call.id ?? `call_${iterIndex}_${call.name}`;
    const tool = tools.find((t) => t.name === call.name);
    if (!tool) {
      context.addToolResult(toolCallId, `Error: tool "${call.name}" not found`);
      continue;
    }
    try {
      const result = await tool.invoke(call.args);
      context.addToolResult(toolCallId, result);
      onToolResult?.(call.name, call.args, result);
    } catch (err: any) {
      context.addToolResult(toolCallId, `Error: ${err.message}`);
    }
  }
}

/** Callbacks for customizing LLM loop behavior. */
export interface LLMLoopCallbacks {
  /** Called when the LLM responds with no tool calls (final text response). */
  onTextResponse(content: string): void;
  /** Called after each iteration of tool processing. */
  onIterationEnd?(): void;
  /** Called with each tool result. */
  onToolResult?(tool: string, args: unknown, result: string): void;
}

/**
 * Run the core LLM tool-use loop: invoke the model, process tool calls, repeat.
 * Returns the final text content when the LLM responds without tool calls.
 * Throws if max iterations exceeded.
 */
export async function runLLMLoop(
  model: BaseChatModel,
  tools: ResolvedTool[],
  context: LLMContext,
  maxIterations: number,
  callbacks: LLMLoopCallbacks,
): Promise<string> {
  const llmWithTools =
    typeof model.bindTools === "function" && tools.length > 0
      ? model.bindTools(tools)
      : model;
  const llmWithoutTools = model;

  for (let i = 0; i < maxIterations; i++) {
    const llm =
      i === maxIterations - 1 && i > 0 ? llmWithoutTools : llmWithTools;
    const llmResponse: AIMessageChunk = await llm.invoke(
      toLangChainMessages(context),
    );
    const toolCalls = llmResponse.tool_calls ?? [];
    const content = extractContent(llmResponse);

    if (toolCalls.length === 0) {
      context.addAssistant(content);
      callbacks.onTextResponse(content);
      return content;
    }

    context.addMessage({
      role: "assistant",
      content: content || "",
      toolCalls: toolCalls.map((c) => ({
        id: c.id ?? `call_${i}_${c.name}`,
        name: c.name,
        args: c.args as Record<string, unknown>,
      })),
    });

    await processToolCalls(toolCalls, tools, context, i, callbacks.onToolResult);
    callbacks.onIterationEnd?.();
  }

  throw new Error("LLM execution loop exceeded max iterations");
}
