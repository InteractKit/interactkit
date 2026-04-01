// LLM base class
export { LLMEntity } from "./base.js";
export type { ToolCallEvent, RequestPriority } from "./base.js";

// LLM decorators
export {
  Context,
  Executor,
  Tool,
  LLMExecutionTrigger,
  getLLMEntityMeta,
  getLLMContextProp,
  getLLMExecutorProp,
  getLLMTools,
  getLLMTriggers,
  MaxIterations,
  getMaxIterations,
  ThinkingLoop,
  getThinkingLoopMeta,
} from "./decorators.js";
export type { LLMEntityOptions, ToolOptions, ThinkingLoopOptions } from "./decorators.js";
export { setLLMTools } from "./decorators.js";

// Thinking loop runtime
export { LLMThinkingLoop } from "./thinking-loop.js";
export type {
  PendingTask,
  ThinkingLoopEvent,
  ThinkingLoopTickEvent,
  ThinkingLoopRespondEvent,
  ThinkingLoopTimeoutEvent,
  ThinkingLoopIdleEvent,
  ThinkingLoopErrorEvent,
  ThinkingLoopTaskEvent,
  ThinkingLoopThoughtEvent,
  ThinkingLoopSleepEvent,
  ThinkingLoopIntervalEvent,
  ThinkingLoopDeferEvent,
  ObserverEmitter,
} from "./thinking-loop.js";

// LLM context class
export { LLMContext } from "./context.js";
export type { LLMMessage, LLMContextOptions } from "./context.js";

// Shareable conversation context entity
export { ConversationContext } from "./conversation.js";

// LLM trigger params
export type { LLMExecutionTriggerParams } from "./trigger.js";

// LLM utilities
export {
  buildSystemPrompt,
  getExecutorModel,
  extractContent,
  toLangChainMessages,
  toResultString,
  runLLMLoop,
} from "./utils.js";
export type { ResolvedTool, LLMLoopCallbacks } from "./utils.js";
