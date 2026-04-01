import "reflect-metadata";
import { z } from "zod";
import { BaseEntity } from "../entity/types.js";
import { State } from "../entity/decorators/index.js";
import { getEntityMeta } from "../entity/decorators/index.js";
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
import { LLMThinkingLoop, type PendingTask, type ScheduledItem } from "./thinking-loop.js";
import {
  buildSystemPrompt,
  getExecutorModel,
  runLLMLoop,
  toResultString,
  type ResolvedTool,
} from "./utils.js";

// Single key for all @Tool metadata — unified in llm/decorators.ts
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

  // ── Persisted thinking loop state ──
  @State({ description: "Persisted scheduled items for the thinking loop" })
  private _persistedSchedules: ScheduledItem[] = [];

  @State({ description: "Total thinking loop tick count" })
  private _persistedTickCount: number = 0;

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

    // Restore persisted state
    loop.restoreSchedules(this._persistedSchedules);
    loop.restoreTickCount(this._persistedTickCount);

    // Start the loop
    loop.start(
      async () => {
        await this._thinkingTick();
        // Sync state back after each tick
        this._persistedSchedules = [...loop.getSchedules()];
        this._persistedTickCount = loop.tickCount;
      },
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

  /**
   * Send a fire-and-forget notification to the thinking loop.
   * The LLM sees it on the next tick but doesn't need to respond.
   */
  notify(message: string): void {
    if (!this._thinkingLoopBooted) this.__bootThinkingLoop();
    if (this._thinkingLoop) {
      this._thinkingLoop.pushNotification(message);
    }
  }

  // ── Thinking Loop Tick ──

  /**
   * One tick of the thinking loop. Builds a prompt with pending tasks,
   * calls the LLM, processes tool calls (including respond()).
   */
  private async _thinkingTick(): Promise<void> {
    const loop = this._thinkingLoop!;
    const tools = this._collectTools();

    // Add built-in thinking loop tools
    this._addThinkingLoopTools(tools, loop);

    // Build system prompt from @Describe
    const prompt = buildSystemPrompt(this);
    if (prompt) this.context.setSystemPrompt(prompt);

    // Build the tick user message
    const taskPrompt = loop.buildTasksPrompt();
    const notifPrompt = loop.buildNotificationsPrompt();
    const hasWork = taskPrompt || notifPrompt;
    const hasSchedules = loop.getSchedules().length > 0;
    const tickMessage = hasWork
      ? `Continue your thinking.${taskPrompt}${notifPrompt}\n\nThink about the situation, then act. Use respond() to answer pending tasks. You can also use other tools.`
      : `Continue your thinking. No pending tasks or notifications.${hasSchedules ? " You have active schedules — use sleep() to wait efficiently." : ""} If you have nothing to do, use sleep() to save tokens. Only stay awake if you are actively working on something.`;

    this.context.addUser(tickMessage);

    const model = getExecutorModel(this);
    if (!model) return;

    const maxIterations = getMaxIterations(this.constructor as Function) ?? 20;

    try {
      await runLLMLoop(model, tools, this.context, maxIterations, {
        onTextResponse: (content) => {
          if (content) {
            this.response.emit(content);
            loop._emit({ type: "thought", content });
          }
        },
        onToolResult: (tool, args, result) => {
          this.toolCall.emit({ tool, args, result });
        },
      });
    } catch {
      // Max iterations exceeded in thinking tick — not fatal, just stop this tick
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

  /** Add built-in thinking loop tools (respond, think, idle, sleep, set_interval, defer). */
  private _addThinkingLoopTools(tools: ResolvedTool[], loop: LLMThinkingLoop): void {
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

    tools.push({
      name: "sleep",
      description: `Sleep for N ticks (max ${loop.maxSleepTicks}). Saves tokens when nothing is happening. Wakes early if a new task arrives.`,
      schema: z.object({
        ticks: z.number().describe(`Number of ticks to sleep (1-${loop.maxSleepTicks})`),
      }),
      invoke: async (args: any) => loop.sleep(args.ticks),
    });

    tools.push({
      name: "set_interval",
      description: `Change how often you think. Range: ${loop.minIntervalMs}ms - ${loop.maxIntervalMs}ms. Current: ${loop.intervalMs}ms. Lower = faster thinking (more tokens). Higher = slower (fewer tokens).`,
      schema: z.object({
        ms: z.number().describe(`New interval in milliseconds (${loop.minIntervalMs}-${loop.maxIntervalMs})`),
      }),
      invoke: async (args: any) => loop.setInterval(args.ms),
    });

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

    tools.push({
      name: "schedule",
      description: "Schedule a future notification. Use delayMs for one-shot, add intervalMs for recurring.",
      schema: z.object({
        message: z.string().describe("The notification message"),
        delayMs: z.number().describe("Delay in ms before first fire"),
        intervalMs: z.number().optional().describe("If set, repeat every intervalMs after the first fire"),
      }),
      invoke: async (args: any) => {
        const id = loop.schedule(args.message, args.delayMs, args.intervalMs);
        return args.intervalMs
          ? `Scheduled recurring "${args.message}" (id: ${id}), first in ${args.delayMs}ms, then every ${args.intervalMs}ms.`
          : `Scheduled "${args.message}" (id: ${id}) in ${args.delayMs}ms.`;
      },
    });

    tools.push({
      name: "unschedule",
      description: "Cancel a scheduled notification by ID.",
      schema: z.object({
        id: z.string().describe("The schedule ID to cancel"),
      }),
      invoke: async (args: any) => {
        return loop.unschedule(args.id)
          ? `Schedule ${args.id} cancelled.`
          : `Schedule ${args.id} not found.`;
      },
    });

    tools.push({
      name: "see_schedules",
      description: "List all active scheduled notifications.",
      schema: z.object({}),
      invoke: async () => {
        const schedules = loop.getSchedules();
        if (schedules.length === 0) return "No active schedules.";
        return schedules.map((s) => {
          const untilFire = Math.max(0, Math.round((s.nextFireAt - Date.now()) / 1000));
          const recurring = s.intervalMs ? ` (every ${s.intervalMs / 1000}s)` : " (one-shot)";
          return `  [${s.id}] "${s.message}" — fires in ${untilFire}s${recurring}`;
        }).join("\n");
      },
    });
  }

  /**
   * Collect all tools available to the LLM (own llmCallable + ref/component tools).
   */
  private _collectTools(): ResolvedTool[] {
    const entityCtor = this.constructor;
    const toolMeta: Map<string, ToolOptions> =
      Reflect.getOwnMetadata(LLM_TOOL_KEY, entityCtor) ?? new Map();
    const entity = this as any;
    const tools: ResolvedTool[] = [];

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
          const resultStr = toResultString(await fn.call(entity, toolArgs));
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
            const resultStr = toResultString(await fn.call(child, toolArgs));
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
    const model = getExecutorModel(this);
    if (!model)
      throw new Error(
        "LLMEntity requires an @Executor() property with a LangChain BaseChatModel instance",
      );

    const tools = this._collectTools();

    const prompt = buildSystemPrompt(this);
    if (prompt) context.setSystemPrompt(prompt);

    context.addUser(params.message);

    const maxIterations = getMaxIterations(this.constructor as Function) ?? 20;
    return runLLMLoop(model, tools, context, maxIterations, {
      onTextResponse: (content) => {
        this.response.emit(content);
        this.drainCompletedContexts();
      },
      onIterationEnd: () => {
        this.drainCompletedContexts();
      },
      onToolResult: (tool, args, result) => {
        this.toolCall.emit({ tool, args, result });
      },
    });
  }
}
