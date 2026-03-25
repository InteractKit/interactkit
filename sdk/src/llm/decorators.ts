import 'reflect-metadata';

const LLM_ENTITY_KEY = Symbol('llm:entity');
const LLM_CONTEXT_KEY = Symbol('llm:context');
const LLM_EXECUTOR_KEY = Symbol('llm:executor');
const LLM_TOOL_KEY = Symbol('llm:tools');
const LLM_VISIBLE_KEY = Symbol('llm:visible');
const LLM_TRIGGER_KEY = Symbol('llm:triggers');

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

// ─── @LLMTool ─────────────────────────────────────────────

export interface LLMToolOptions {
  /** Description shown to the LLM so it knows when to use this tool */
  description: string;
  /** Override the tool name (defaults to method name) */
  name?: string;
}

/**
 * Exposes a method as a tool the LLM can call.
 * The method's parameters become the tool's input schema (via codegen).
 */
export function LLMTool(options: LLMToolOptions): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) {
    const ctor = target.constructor;
    const tools: Map<string, LLMToolOptions> =
      Reflect.getOwnMetadata(LLM_TOOL_KEY, ctor) ?? new Map();
    tools.set(String(propertyKey), options);
    Reflect.defineMetadata(LLM_TOOL_KEY, tools, ctor);
  };
}

// ─── @LLMVisible / @LLMHidden ────────────────────────────

/**
 * Exposes a property or method to the LLM as part of its context.
 * State properties become visible in the LLM's system prompt.
 * Methods become callable by the LLM (use @LLMTool for richer control).
 */
export function LLMVisible(): PropertyDecorator & MethodDecorator {
  return function (target: object, propertyKey: string | symbol) {
    const ctor = target.constructor;
    const visible: Set<string> = Reflect.getOwnMetadata(LLM_VISIBLE_KEY, ctor) ?? new Set();
    visible.add(String(propertyKey));
    Reflect.defineMetadata(LLM_VISIBLE_KEY, visible, ctor);
  };
}

// Everything is hidden from the LLM by default.
// Use @LLMVisible() or @LLMTool() to opt in.

// ─── @LLMExecutionTrigger ─────────────────────────────────

/**
 * Marks a method as an LLM execution trigger and takes over its body.
 * At runtime, calling this method:
 *   1. Appends message to @Context
 *   2. Calls the @Executor with @LLMTool methods as available tools
 *   3. If LLM returns tool calls, executes them and feeds results back
 *   4. Loops until the LLM produces a final text response
 *   5. Returns the response
 *
 * The method must accept LLMExecutionTriggerParams and return Promise<string>.
 * The body is replaced — developer leaves it empty.
 */
export function LLMExecutionTrigger(): MethodDecorator {
  return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const ctor = target.constructor;
    const triggers: Set<string> = Reflect.getOwnMetadata(LLM_TRIGGER_KEY, ctor) ?? new Set();
    triggers.add(String(propertyKey));
    Reflect.defineMetadata(LLM_TRIGGER_KEY, triggers, ctor);

    // Replace the method body with the LLM execution loop
    descriptor.value = async function (this: any, params: any): Promise<string> {
      // Resolve @Context, @Executor, @LLMTool from metadata
      const entityCtor = this.constructor;
      const contextProp = Reflect.getOwnMetadata(LLM_CONTEXT_KEY, entityCtor);
      const executorProp = Reflect.getOwnMetadata(LLM_EXECUTOR_KEY, entityCtor);
      const toolMeta: Map<string, { description: string; name?: string }> =
        Reflect.getOwnMetadata(LLM_TOOL_KEY, entityCtor) ?? new Map();

      const context = contextProp ? this[contextProp] : null;
      const model = executorProp ? this[executorProp] : null;

      if (!model) throw new Error(`@LLMEntity requires an @Executor() with a LangChain BaseChatModel instance`);
      if (!context) throw new Error(`@LLMEntity requires a @Context() property`);

      // Build LangChain-compatible tool objects
      // Each tool wraps an @LLMTool method with { name, description, schema, invoke }
      const entity = this;
      const tools = [...toolMeta.entries()].map(([methodName, opts]) => ({
        name: opts.name ?? methodName,
        description: opts.description,
        schema: undefined as any, // Zod schema injected by runtime from registry
        async invoke(args: any) {
          const fn = entity[methodName];
          if (typeof fn !== 'function') throw new Error(`Tool "${methodName}" not found`);
          const result = await fn.call(entity, args);
          return typeof result === 'string' ? result : JSON.stringify(result);
        },
      }));

      // Bind tools to model — LangChain: model.bindTools(tools)
      const llmWithTools = typeof model.bindTools === 'function' && tools.length > 0
        ? model.bindTools(tools)
        : model;

      // Add user message to context
      context.addUser(params.message);

      // Build LangChain message array from context
      function toMessages(ctx: any): any[] {
        return ctx.getMessages().map((m: any) => {
          switch (m.role) {
            case 'system':  return { role: 'system', content: m.content };
            case 'user':    return { role: 'user', content: m.content };
            case 'assistant': return { role: 'assistant', content: m.content };
            case 'tool':    return { role: 'tool', content: m.content, tool_call_id: m.toolCallId };
            default:        return { role: m.role, content: m.content };
          }
        });
      }

      // Execution loop — LangChain: invoke → check tool_calls → execute → loop
      const MAX_ITERATIONS = 10;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await llmWithTools.invoke(toMessages(context));

        // LangChain AIMessage: response.tool_calls is the standard property
        const toolCalls = response.tool_calls ?? response.additional_kwargs?.tool_calls ?? [];
        const content = typeof response.content === 'string'
          ? response.content
          : Array.isArray(response.content)
            ? response.content.map((b: any) => b.text ?? '').join('')
            : String(response.content ?? '');

        if (!toolCalls || toolCalls.length === 0) {
          // No tool calls — final response
          context.addAssistant(content);
          return content;
        }

        // Add the assistant message with tool calls to context
        context.addMessage({ role: 'assistant', content: content || '' });

        // Execute tool calls
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
        // Loop back — context now has tool results, LLM will process them
      }

      throw new Error('LLM execution loop exceeded max iterations');
    };
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

export function getLLMTools(target: Function): Map<string, LLMToolOptions> {
  return Reflect.getOwnMetadata(LLM_TOOL_KEY, target) ?? new Map();
}

export function getLLMVisible(target: Function): Set<string> {
  return Reflect.getOwnMetadata(LLM_VISIBLE_KEY, target) ?? new Set();
}

export function getLLMTriggers(target: Function): Set<string> {
  return Reflect.getOwnMetadata(LLM_TRIGGER_KEY, target) ?? new Set();
}

