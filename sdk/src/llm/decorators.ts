import 'reflect-metadata';

const LLM_ENTITY_KEY = Symbol.for('llm:entity');
const LLM_CONTEXT_KEY = Symbol.for('llm:context');
const LLM_EXECUTOR_KEY = Symbol.for('llm:executor');
const LLM_TOOL_KEY = Symbol.for('llm:tools');
const LLM_TRIGGER_KEY = Symbol.for('llm:triggers');

// ─── @LLMEntity ───────────────────────────────────────────

export interface LLMEntityOptions {}

/**
 * Marks an entity class as LLM-powered.
 * Use alongside @Entity. The LLM instance goes on the @Executor() property.
 */
export function LLMEntity(options: LLMEntityOptions = {}): ClassDecorator {
  return function (target: Function) {
    Reflect.defineMetadata(LLM_ENTITY_KEY, options, target);
  };
}

// ─── @LLMContext ──────────────────────────────────────────

/**
 * Marks a property as the LLM conversation context.
 * The property should be typed as LLMContext.
 * Runtime manages conversation history, system prompt injection, etc.
 */
export function Context(): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    Reflect.defineMetadata(LLM_CONTEXT_KEY, String(propertyKey), target.constructor);
  };
}

// ─── @Executor ────────────────────────────────────────────

/**
 * Marks a property as the LLM executor instance.
 * Runtime injects the LangChain LLM from @LLMEntity({ executor }).
 */
export function Executor(): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    Reflect.defineMetadata(LLM_EXECUTOR_KEY, String(propertyKey), target.constructor);
  };
}

// ─── @Tool ────────────────────────────────────────────────

export interface ToolOptions {
  /** Description shown to the LLM so it knows when to use this tool */
  description: string;
  /** Override the tool name (defaults to method name) */
  name?: string;
  /** If true, this tool is available to the LLM during invoke(). Own @Tool methods are external-only by default. */
  llmCallable?: boolean;
}

/**
 * Exposes a method as a tool the LLM can call.
 * The method's parameters become the tool's input schema (via codegen).
 *
 * Can be used on any entity — not just LLMEntity classes.
 * On an LLMEntity, all refs' @Tool methods are automatically
 * exposed to the LLM as namespaced tools (e.g. "memory.search").
 */
export function Tool(options: ToolOptions): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) {
    const ctor = target.constructor;
    const tools: Map<string, ToolOptions> =
      Reflect.getOwnMetadata(LLM_TOOL_KEY, ctor) ?? new Map();
    tools.set(String(propertyKey), options);
    Reflect.defineMetadata(LLM_TOOL_KEY, tools, ctor);
  };
}

// @LLMExecutionTrigger is deprecated — LLMEntity.chat() handles this now.
// Kept for backward compatibility only.
export function LLMExecutionTrigger(): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) {
    const ctor = target.constructor;
    const triggers: Set<string> = Reflect.getOwnMetadata(LLM_TRIGGER_KEY, ctor) ?? new Set();
    triggers.add(String(propertyKey));
    Reflect.defineMetadata(LLM_TRIGGER_KEY, triggers, ctor);
  };
}

// ─── @MaxIterations ──────────────────────────────────────

const LLM_MAX_ITERATIONS_KEY = Symbol.for('llm:maxIterations');

/**
 * Sets the maximum number of LLM tool-use iterations per invocation.
 * Defaults to 2 if not specified.
 *
 * @example
 * ```ts
 * @Entity({ description: 'Agent' })
 * class Agent extends LLMEntity {
 *   @MaxIterations(5)
 *   private maxIterations!: number;
 * }
 * ```
 */
export function MaxIterations(value: number): PropertyDecorator {
  return function (target: object, _propertyKey: string | symbol) {
    Reflect.defineMetadata(LLM_MAX_ITERATIONS_KEY, value, target.constructor);
  };
}

export function getMaxIterations(target: Function): number | undefined {
  return Reflect.getOwnMetadata(LLM_MAX_ITERATIONS_KEY, target);
}

// ─── @ThinkingLoop ───────────────────────────────────────

const LLM_THINKING_LOOP_KEY = Symbol.for('llm:thinkingLoop');

export interface ThinkingLoopOptions {
  /** Interval between thinking ticks in ms (default: 5000) */
  intervalMs?: number;
  /** After this many ms, inject a reminder about pending tasks (default: 30000) */
  softTimeoutMs?: number;
  /** After this many ms, remove task from loop and force-invoke directly (default: 60000) */
  hardTimeoutMs?: number;
  /** Max messages to keep in context sliding window (default: 50) */
  contextWindow?: number;
  /** Enable inner monologue — LLM thinks continuously. When false, invoke() uses classic direct execution. (default: true) */
  innerMonologue?: boolean;

  // ── Built-in tool config ──

  /** Max ticks the LLM can sleep for via sleep() tool (default: 12, i.e. 60s at 5s interval) */
  maxSleepTicks?: number;
  /** Min intervalMs the LLM can set via set_interval() (default: 1000) */
  minIntervalMs?: number;
  /** Max intervalMs the LLM can set via set_interval() (default: 60000) */
  maxIntervalMs?: number;
  /** Max times a single task can be deferred (default: 2) */
  maxDefers?: number;
  /** If true, the LLM thinks every tick even with no pending tasks. Use for autonomous agents. (default: false) */
  alwaysThink?: boolean;
}

/**
 * Enables the thinking loop on an LLMEntity. The property is hydrated
 * at runtime with an LLMThinkingLoop instance that can be controlled
 * in real time (pause/resume, change intervals, toggle monologue).
 *
 * @example
 * ```ts
 * @Entity({ description: 'NPC' })
 * class Npc extends LLMEntity {
 *   @ThinkingLoop({ intervalMs: 5000, softTimeoutMs: 30000, hardTimeoutMs: 60000 })
 *   private thinkingLoop!: LLMThinkingLoop;
 * }
 * ```
 */
export function ThinkingLoop(options: ThinkingLoopOptions = {}): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    Reflect.defineMetadata(LLM_THINKING_LOOP_KEY, {
      propertyKey: String(propertyKey),
      ...options,
    }, target.constructor);
  };
}

export function getThinkingLoopMeta(target: Function): (ThinkingLoopOptions & { propertyKey: string }) | undefined {
  return Reflect.getOwnMetadata(LLM_THINKING_LOOP_KEY, target);
}

// ─── Reflection helpers ───────────────────────────────────

export function getLLMEntityMeta(target: Function): LLMEntityOptions | undefined {
  return Reflect.getOwnMetadata(LLM_ENTITY_KEY, target);
}

export function getLLMContextProp(target: Function): string | undefined {
  return Reflect.getOwnMetadata(LLM_CONTEXT_KEY, target);
}

export function getLLMExecutorProp(target: Function): string | undefined {
  return Reflect.getOwnMetadata(LLM_EXECUTOR_KEY, target);
}


export function getLLMTools(target: Function): Map<string, ToolOptions> {
  return Reflect.getOwnMetadata(LLM_TOOL_KEY, target) ?? new Map();
}

/** Registers tools on a class at runtime (used by MCP integration to add discovered tools) */
export function setLLMTools(target: Function, tools: Map<string, ToolOptions>): void {
  Reflect.defineMetadata(LLM_TOOL_KEY, tools, target);
}

export function getLLMTriggers(target: Function): Set<string> {
  return Reflect.getOwnMetadata(LLM_TRIGGER_KEY, target) ?? new Set();
}

