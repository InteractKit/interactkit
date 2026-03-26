import 'reflect-metadata';

const LLM_ENTITY_KEY = Symbol.for('llm:entity');
const LLM_CONTEXT_KEY = Symbol.for('llm:context');
const LLM_EXECUTOR_KEY = Symbol.for('llm:executor');
const LLM_TOOL_KEY = Symbol.for('llm:tools');
const LLM_TRIGGER_KEY = Symbol.for('llm:triggers');
const LLM_SYSTEM_PROMPT_KEY = Symbol.for('llm:systemPrompt');

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

// ─── @SystemPrompt ───────────────────────────────────────

/**
 * Marks a property or method as the LLM system prompt.
 * On a property: the value is used as the system prompt.
 * On a method: the return value is used (called before each LLM invocation).
 */
export function SystemPrompt(): PropertyDecorator & MethodDecorator {
  return function (target: object, propertyKey: string | symbol) {
    Reflect.defineMetadata(LLM_SYSTEM_PROMPT_KEY, String(propertyKey), target.constructor);
  };
}

// ─── @Tool ────────────────────────────────────────────────

export interface ToolOptions {
  /** Description shown to the LLM so it knows when to use this tool */
  description: string;
  /** Override the tool name (defaults to method name) */
  name?: string;
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

export function getLLMSystemPromptProp(target: Function): string | undefined {
  return Reflect.getOwnMetadata(LLM_SYSTEM_PROMPT_KEY, target);
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

