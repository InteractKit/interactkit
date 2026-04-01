import "reflect-metadata";
import { z } from "zod";
import { BaseEntity } from "../entity/types.js";
import {
  getDescribeMethod,
  getEntityMeta,
} from "../entity/decorators/index.js";
import { getRegistry } from "../registry.js";
import { LLMContext, type LLMMessage } from "./context.js";
import { EntityStreamImpl } from "../entity/stream/index.js";
import type { EntityStream } from "../entity/stream/index.js";
import {
  getMaxIterations,
  getThinkingLoopMeta,
  type ToolOptions,
} from "./decorators.js";
import type { LLMExecutionTriggerParams } from "./trigger.js";
import { LLMThinkingLoop, type PendingTask } from "./thinking-loop.js";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage, AIMessageChunk } from "@langchain/core/messages";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";

const LLM_EXECUTOR_KEY = Symbol.for("llm:executor");
const LLM_TOOL_KEY = Symbol.for("llm:tools");

/** Priority levels for request queue */
export enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/** Queue item interface */
interface QueueItem {
  id: string;
  priority: RequestPriority;
  params: LLMExecutionTriggerParams;
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
  timestamp: number;
}

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
 *
 * Two execution modes:
 * 1. **Classic** (no @ThinkingLoop) — invoke() calls the LLM directly.
 * 2. **Thinking Loop** (@ThinkingLoop on a property) — invoke() pushes tasks to
 *    a continuous thinking loop. The LLM has an inner monologue and uses a
 *    respond() tool to answer tasks. Soft/hard timeouts prevent hangs.
 */
export abstract class LLMEntity extends BaseEntity {
  protected context = new LLMContext();
  readonly response: EntityStream<string> = new EntityStreamImpl<string>();
  readonly toolCall: EntityStream<ToolCallEvent> =
    new EntityStreamImpl<ToolCallEvent>();

  // ── Classic mode state ──
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private processingLock = false;
  private activeContexts: Map<string, LLMContext> = new Map();
  private completedContexts: LLMMessage[][] = [];

  // ── Thinking loop (always active — default execution model) ──
  private _thinkingLoop: LLMThinkingLoop | null = null;
  private _thinkingLoopBooted = false;

  /**
   * Returns true if the entity has no queued or in-progress LLM invocations.
   */
  isIdle(): boolean {
    if (this._thinkingLoop) {
      return !this._thinkingLoop.isThinking && this._thinkingLoop.pending === 0;
    }
    // Fallback before boot
    return !this.isProcessing && this.queue.length === 0;
  }

  /**
   * Called by the entity runner after instantiation to hydrate the thinking loop.
   * Always creates a loop — @ThinkingLoop decorator customizes config and
   * exposes the runtime handle on a property. Without the decorator, defaults are used.
   *
   * @param observerEmit — optional callback to push EventEnvelopes through the observer pipeline
   */
  __bootThinkingLoop(
    observerEmit?: (
      envelope: import("../events/types.js").EventEnvelope,
    ) => void,
  ): void {
    if (this._thinkingLoopBooted) return;
    this._thinkingLoopBooted = true;

    const meta = getThinkingLoopMeta(this.constructor as Function);
    const loop = new LLMThinkingLoop(meta ?? {});
    this._thinkingLoop = loop;

    // If @ThinkingLoop decorator is present, assign to the decorated property
    if (meta?.propertyKey) {
      (this as any)[meta.propertyKey] = loop;
    }

    // Wire observer (#3)
    if (observerEmit) {
      loop.setObserver(this.id, observerEmit);
    }

    // Start the loop
    loop.start(
      () => this._thinkingTick(),
      (task) => this._forceInvoke(task),
    );
  }

  // ── Public API ──

  /**
   * Invoke the LLM with a message. Returns a promise that resolves to the response.
   *
   * - With @ThinkingLoop + innerMonologue: pushes a task to the thinking loop.
   *   The LLM picks it up on the next tick and calls respond(taskId, result).
   * - Without @ThinkingLoop or innerMonologue=false: runs the LLM directly (classic).
   */
  async invoke(
    params: LLMExecutionTriggerParams,
    priority: RequestPriority = RequestPriority.NORMAL,
  ): Promise<string> {
    // Boot thinking loop on first invoke if not already booted
    if (!this._thinkingLoopBooted) this.__bootThinkingLoop();

    // Thinking loop mode
    if (this._thinkingLoop?.innerMonologue) {
      this._thinkingLoop.touch();
      return this._thinkingLoop.pushTask(params.message);
    }

    // Classic mode — parallel or sequential
    if (!params.sequential) {
      const isolatedContext = this.createIsolatedContext();
      const requestId = this.generateRequestId();
      this.activeContexts.set(requestId, isolatedContext);

      try {
        const result = await this._invokeInner(params, isolatedContext);
        const newMessages = isolatedContext
          .getMessages()
          .slice(this.context.getMessages().length);
        const safeMessages = newMessages.filter(
          (m) =>
            m.role === "user" ||
            (m.role === "assistant" && !m.toolCalls?.length),
        );
        this.addCompletedContext(safeMessages);
        return result;
      } finally {
        this.activeContexts.delete(requestId);
        this.emitQueueStatus();
      }
    }

    const requestId = this.generateRequestId();
    return new Promise((resolve, reject) => {
      this.enqueue({
        id: requestId,
        priority,
        params,
        resolve,
        reject,
        timestamp: Date.now(),
      });
      this.processQueue();
    });
  }

  // ── Thinking Loop Tick ──

  /**
   * One tick of the thinking loop. Builds a prompt with pending tasks,
   * calls the LLM, processes tool calls (including respond()).
   */
  private async _thinkingTick(): Promise<void> {
    const loop = this._thinkingLoop!;
    const tools = this._collectTools();

    // Add the built-in respond() tool
    tools.push({
      name: "respond",
      description:
        "Return a result for a pending task. Use this to answer tasks pushed via invoke().",
      schema: z.object({
        taskId: z.string().describe("The task ID to respond to"),
        result: z.string().describe("Your response/answer for this task"),
      }),
      invoke: async (args: any) => {
        const resolved = loop.resolveTask(args.taskId, args.result);
        return resolved
          ? `Task ${args.taskId} resolved.`
          : `Task ${args.taskId} not found.`;
      },
    });

    // Add think() tool — explicit inner monologue, adds to context, emits thought event
    tools.push({
      name: "think",
      description: "Think out loud. Your thought is recorded in your context and visible to observers, but not sent to anyone. Use this to reason, plan, or reflect before acting.",
      schema: z.object({
        thought: z.string().describe("Your inner thought"),
      }),
      invoke: async (args: any) => {
        loop._emit({ type: "thought", content: args.thought });
        return "Thought recorded.";
      },
    });

    // Add idle() tool — LLM calls this when it has nothing to do
    tools.push({
      name: "idle",
      description:
        "Do nothing this tick. Call this when you have no tasks and nothing to act on.",
      schema: z.object({}),
      invoke: async () => "Idling.",
    });

    // Add sleep() tool — skip N ticks, wakes early if tasks arrive
    tools.push({
      name: "sleep",
      description: `Sleep for N ticks (max ${loop.maxSleepTicks}). Saves tokens when nothing is happening. Wakes early if a new task arrives.`,
      schema: z.object({
        ticks: z.number().describe(`Number of ticks to sleep (1-${loop.maxSleepTicks})`),
      }),
      invoke: async (args: any) => loop.sleep(args.ticks),
    });

    // Add set_interval() tool — change thinking speed
    tools.push({
      name: "set_interval",
      description: `Change how often you think. Range: ${loop.minIntervalMs}ms - ${loop.maxIntervalMs}ms. Current: ${loop.intervalMs}ms. Lower = faster thinking (more tokens). Higher = slower (fewer tokens).`,
      schema: z.object({
        ms: z.number().describe(`New interval in milliseconds (${loop.minIntervalMs}-${loop.maxIntervalMs})`),
      }),
      invoke: async (args: any) => loop.setInterval(args.ms),
    });

    // Add defer() tool — push a task back to handle later
    tools.push({
      name: "defer",
      description: `Defer a pending task to handle later. Resets its timeout. Each task can be deferred at most ${loop.maxDefers} times.`,
      schema: z.object({
        taskId: z.string().describe("The task ID to defer"),
      }),
      invoke: async (args: any) => {
        const result = loop.deferTask(args.taskId);
        return result.message;
      },
    });

    // Build system prompt from @Describe
    this._refreshSystemPrompt();

    // Build the tick user message
    const taskPrompt = loop.buildTasksPrompt();
    const tickMessage = taskPrompt
      ? `Continue your thinking.${taskPrompt}\n\nThink about the situation, then act. Use respond() to answer pending tasks. You can also use other tools.`
      : `Continue your thinking. No pending tasks. You may act on your own, reflect, or idle.`;

    this.context.addUser(tickMessage);

    // Run the LLM loop (same as _invokeInner but on the shared context directly)
    const entityCtor = this.constructor;
    const executorProp: string | undefined = Reflect.getOwnMetadata(
      LLM_EXECUTOR_KEY,
      entityCtor,
    );
    const model: BaseChatModel | null = executorProp
      ? (this as any)[executorProp]
      : null;
    if (!model) return;

    const llmWithTools =
      typeof model.bindTools === "function" && tools.length > 0
        ? model.bindTools(tools)
        : model;
    const llmWithoutTools = model;

    const MAX_ITERATIONS = getMaxIterations(this.constructor as Function) ?? 20;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const llm =
        i === MAX_ITERATIONS - 1 && i > 0 ? llmWithoutTools : llmWithTools;
      const llmResponse: AIMessageChunk = await llm.invoke(
        this._toMessages(this.context),
      );
      const toolCalls = llmResponse.tool_calls ?? [];
      const content =
        typeof llmResponse.content === "string"
          ? llmResponse.content
          : Array.isArray(llmResponse.content)
            ? llmResponse.content.map((b: any) => b.text ?? "").join("")
            : String(llmResponse.content ?? "");

      if (toolCalls.length === 0) {
        // LLM just thought/spoke without using tools — that's the inner monologue
        this.context.addAssistant(content);
        if (content) {
          this.response.emit(content);
          loop._emit({ type: "thought", content });
        }
        return;
      }

      this.context.addMessage({
        role: "assistant",
        content: content || "",
        toolCalls: toolCalls.map((c) => ({
          id: c.id ?? `call_${i}_${c.name}`,
          name: c.name,
          args: c.args as Record<string, unknown>,
        })),
      });

      for (const call of toolCalls) {
        const toolCallId = call.id ?? `call_${i}_${call.name}`;
        const tool = tools.find((t) => t.name === call.name);
        if (!tool) {
          this.context.addToolResult(
            toolCallId,
            `Error: tool "${call.name}" not found`,
          );
          continue;
        }
        try {
          const result = await tool.invoke(call.args);
          this.context.addToolResult(toolCallId, result);
          this.toolCall.emit({ tool: call.name, args: call.args, result });
        } catch (err: any) {
          this.context.addToolResult(toolCallId, `Error: ${err.message}`);
        }
      }
    }
  }

  /**
   * Force-invoke for a task that hit hard timeout.
   * Runs the classic _invokeInner with the task's message directly.
   */
  private async _forceInvoke(task: PendingTask): Promise<string> {
    const isolatedContext = this.createIsolatedContext();
    return this._invokeInner({ message: task.message }, isolatedContext);
  }

  // ── Helpers ──

  private _refreshSystemPrompt(): void {
    const entity = this as any;
    const entityCtor = this.constructor;
    const promptParts: string[] = [];

    const ownDescribe = getDescribeMethod(entityCtor as any);
    if (ownDescribe && typeof entity[ownDescribe] === "function") {
      const desc = entity[ownDescribe]();
      if (desc) promptParts.push(desc);
    }
    for (const propName of Object.getOwnPropertyNames(this)) {
      const child = entity[propName];
      if (
        !child ||
        typeof child !== "object" ||
        !("id" in child) ||
        child === this
      )
        continue;
      const childDescribe = getDescribeMethod(child.constructor);
      if (childDescribe && typeof child[childDescribe] === "function") {
        const desc = child[childDescribe]();
        if (desc) promptParts.push(`[${propName}] ${desc}`);
      }
    }

    if (promptParts.length > 0) {
      this.context.setSystemPrompt(promptParts.join("\n\n"));
    }
  }

  private _toMessages(ctx: LLMContext): BaseMessage[] {
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

  /**
   * Collect all tools available to the LLM (own llmCallable + ref/component tools).
   */
  private _collectTools(): Array<{
    name: string;
    description: string;
    schema: any;
    invoke: (a: any) => Promise<string>;
  }> {
    const entityCtor = this.constructor;
    const toolMeta: Map<string, ToolOptions> =
      Reflect.getOwnMetadata(LLM_TOOL_KEY, entityCtor) ?? new Map();
    const entity = this as any;
    const tools: Array<{
      name: string;
      description: string;
      schema: any;
      invoke: (a: any) => Promise<string>;
    }> = [];

    const entityType = getEntityMeta(entityCtor as any)?.type;

    // Own @Tool methods (only llmCallable)
    for (const [methodName, opts] of toolMeta.entries()) {
      if (!opts.llmCallable) continue;
      const schema =
        (entityType && getMethodSchema(entityType, methodName)) ?? z.object({});
      tools.push({
        name: opts.name ?? methodName,
        description: opts.description,
        schema,
        async invoke(toolArgs: any) {
          const fn = entity[methodName];
          if (typeof fn !== "function")
            throw new Error(`Tool "${methodName}" not found`);
          const result = await fn.call(entity, toolArgs);
          const resultStr =
            result == null
              ? ""
              : typeof result === "string"
                ? result
                : JSON.stringify(result);
          entity.toolCall.emit({
            tool: opts.name ?? methodName,
            args: toolArgs,
            result: resultStr,
          });
          return resultStr;
        },
      });
    }

    // Ref/component tools
    for (const propName of Object.getOwnPropertyNames(this)) {
      const child = entity[propName];
      if (!child || typeof child !== "object" || !("id" in child)) continue;
      if (child === this) continue;

      const childCtor = child.constructor;
      const childTools: Map<string, ToolOptions> =
        Reflect.getOwnMetadata(LLM_TOOL_KEY, childCtor) ?? new Map();
      const childEntityType = getEntityMeta(childCtor)?.type;

      for (const [childMethod, childOpts] of childTools.entries()) {
        const fullToolName = `${propName}_${childOpts.name ?? childMethod}`;
        const childSchema =
          (childEntityType && getMethodSchema(childEntityType, childMethod)) ??
          z.object({});
        tools.push({
          name: fullToolName,
          description: childOpts.description,
          schema: childSchema,
          async invoke(toolArgs: any) {
            const fn = child[childMethod];
            if (typeof fn !== "function")
              throw new Error(`Tool "${propName}.${childMethod}" not found`);
            const result = await fn.call(child, toolArgs);
            const resultStr =
              result == null
                ? ""
                : typeof result === "string"
                  ? result
                  : JSON.stringify(result);
            entity.toolCall.emit({
              tool: fullToolName,
              args: toolArgs,
              result: resultStr,
            });
            return resultStr;
          },
        });
      }
    }

    return tools;
  }

  // ══════════════════════════════════════════════════════════
  //  Classic mode (unchanged from before @ThinkingLoop)
  // ══════════════════════════════════════════════════════════

  private enqueue(item: QueueItem): void {
    let insertIndex = this.queue.findIndex(
      (existing) => existing.priority < item.priority,
    );
    if (insertIndex === -1) insertIndex = this.queue.length;
    this.queue.splice(insertIndex, 0, item);
    this.emitQueueStatus();
  }

  private async processQueue(): Promise<void> {
    if (this.processingLock) return;
    this.processingLock = true;
    try {
      while (this.queue.length > 0) {
        this.isProcessing = true;
        const item = this.queue.shift()!;
        try {
          const isolatedContext = this.createIsolatedContext();
          this.activeContexts.set(item.id, isolatedContext);
          const result = await this._invokeInner(item.params, isolatedContext);
          this.mergeContext(isolatedContext);
          item.resolve(result);
        } catch (error) {
          item.reject(error);
        } finally {
          this.activeContexts.delete(item.id);
          this.emitQueueStatus();
        }
        await this.yield();
      }
    } finally {
      this.isProcessing = false;
      this.processingLock = false;
    }
  }

  private createIsolatedContext(): LLMContext {
    const isolatedContext = new LLMContext({
      systemPrompt: this.context.getSystemPrompt(),
    });
    for (const message of this.context.getMessages()) {
      isolatedContext.addMessage(message);
    }
    for (const completedMessages of this.completedContexts) {
      for (const message of completedMessages) {
        isolatedContext.addMessage(message);
      }
    }
    return isolatedContext;
  }

  private mergeContext(isolatedContext: LLMContext): void {
    const newMessages = isolatedContext
      .getMessages()
      .slice(this.context.getMessages().length);
    for (const message of newMessages) {
      this.context.addMessage(message);
    }
  }

  private addCompletedContext(messages: LLMMessage[]): void {
    this.completedContexts.push(messages);
  }

  private drainCompletedContexts(): void {
    while (this.completedContexts.length > 0) {
      const messages = this.completedContexts.shift()!;
      for (const message of messages) {
        this.context.addMessage(message);
      }
    }
  }

  private emitQueueStatus(): void {}

  private getQueuePriorityStats(): Record<RequestPriority, number> {
    const stats = {
      [RequestPriority.LOW]: 0,
      [RequestPriority.NORMAL]: 0,
      [RequestPriority.HIGH]: 0,
      [RequestPriority.CRITICAL]: 0,
    };
    for (const item of this.queue) stats[item.priority]++;
    return stats;
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private yield(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  getQueueStatus(): {
    queueSize: number;
    activeRequests: number;
    priorities: Record<RequestPriority, number>;
  } {
    return {
      queueSize: this.queue.length,
      activeRequests: this.activeContexts.size,
      priorities: this.getQueuePriorityStats(),
    };
  }

  clearQueue(error?: Error): void {
    const pendingItems = [...this.queue];
    this.queue = [];
    for (const item of pendingItems) {
      item.reject(error || new Error("Queue cleared"));
    }
    this.emitQueueStatus();
  }

  async waitForCompletion(): Promise<void> {
    while (this.queue.length > 0 || this.activeContexts.size > 0) {
      await this.yield();
    }
  }

  async invokeWithTimeout(
    params: LLMExecutionTriggerParams,
    timeoutMs: number,
    priority: RequestPriority = RequestPriority.NORMAL,
  ): Promise<string> {
    return Promise.race([
      this.invoke(params, priority),
      new Promise<string>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Request timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  async batchInvoke(
    requests: Array<{
      params: LLMExecutionTriggerParams;
      priority?: RequestPriority;
    }>,
  ): Promise<string[]> {
    return Promise.all(
      requests.map(({ params, priority = RequestPriority.NORMAL }) =>
        this.invoke(params, priority),
      ),
    );
  }

  /**
   * Classic direct LLM execution. Used by:
   * - Classic mode invoke()
   * - Hard timeout force-invoke
   */
  private async _invokeInner(
    params: LLMExecutionTriggerParams,
    context: LLMContext,
  ): Promise<string> {
    const entityCtor = this.constructor;
    const executorProp: string | undefined = Reflect.getOwnMetadata(
      LLM_EXECUTOR_KEY,
      entityCtor,
    );

    const model: BaseChatModel | null = executorProp
      ? (this as any)[executorProp]
      : null;
    if (!model)
      throw new Error(
        "LLMEntity requires an @Executor() property with a LangChain BaseChatModel instance",
      );

    const tools = this._collectTools();

    // Build system prompt
    const promptParts: string[] = [];
    const entity = this as any;
    const ownDescribe = getDescribeMethod(entityCtor as any);
    if (ownDescribe && typeof entity[ownDescribe] === "function") {
      const desc = entity[ownDescribe]();
      if (desc) promptParts.push(desc);
    }
    for (const propName of Object.getOwnPropertyNames(this)) {
      const child = entity[propName];
      if (
        !child ||
        typeof child !== "object" ||
        !("id" in child) ||
        child === this
      )
        continue;
      const childDescribe = getDescribeMethod(child.constructor);
      if (childDescribe && typeof child[childDescribe] === "function") {
        const desc = child[childDescribe]();
        if (desc) promptParts.push(`[${propName}] ${desc}`);
      }
    }
    if (promptParts.length > 0)
      context.setSystemPrompt(promptParts.join("\n\n"));

    const llmWithTools =
      typeof model.bindTools === "function" && tools.length > 0
        ? model.bindTools(tools)
        : model;
    const llmWithoutTools = model;
    context.addUser(params.message);

    const MAX_ITERATIONS = getMaxIterations(this.constructor as Function) ?? 20;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const llm =
        i === MAX_ITERATIONS - 1 && i > 0 ? llmWithoutTools : llmWithTools;
      const llmResponse: AIMessageChunk = await llm.invoke(
        this._toMessages(context),
      );
      const toolCalls = llmResponse.tool_calls ?? [];
      const content =
        typeof llmResponse.content === "string"
          ? llmResponse.content
          : Array.isArray(llmResponse.content)
            ? llmResponse.content.map((b: any) => b.text ?? "").join("")
            : String(llmResponse.content ?? "");

      if (toolCalls.length === 0) {
        context.addAssistant(content);
        this.response.emit(content);
        this.drainCompletedContexts();
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

      for (const call of toolCalls) {
        const toolCallId = call.id ?? `call_${i}_${call.name}`;
        const tool = tools.find((t) => t.name === call.name);
        if (!tool) {
          context.addToolResult(
            toolCallId,
            `Error: tool "${call.name}" not found`,
          );
          continue;
        }
        try {
          context.addToolResult(toolCallId, await tool.invoke(call.args));
        } catch (err: any) {
          context.addToolResult(toolCallId, `Error: ${err.message}`);
        }
      }

      this.drainCompletedContexts();
    }

    throw new Error("LLM execution loop exceeded max iterations");
  }
}
