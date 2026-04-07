// @interactkit/sdk — XML-driven entity graph runtime

// Core
export { Entity } from './entity.js';
export { InteractKitRuntime, InteractKitApp } from './runtime.js';
export type { EntityNode, RuntimeConfig, HandlerMap, HandlerFn, ListenerFn } from './runtime.js';
export type { ServeConfig, HttpConfig, WsConfig, ServeRequest, ServeResponse, Middleware } from './serve.js';

// State
export { createReactiveState, flushReactiveState } from './reactive.js';

// LLM
export { createExecutor, createInvokeHandler, collectLLMTools } from './llm/llm.js';
export type { ExecutorConfig } from './llm/llm.js';
export { LLMContext } from './llm/context.js';
export { runLLMLoop } from './llm/utils.js';
export type { ResolvedTool } from './llm/utils.js';

// Event bus
export { EventBus } from './events/bus.js';
export type { EventEnvelope } from './events/types.js';

// Adapters (interfaces)
export type { PubSubAdapter } from './pubsub/adapter.js';
export { RemotePubSubAdapter } from './pubsub/adapter.js';
export type { DatabaseAdapter } from './database/adapter.js';
export type { ObserverAdapter } from './observer/adapter.js';

// Adapter implementations
export { InProcessBusAdapter } from './pubsub/in-process.js';
export { BaseObserver } from './observer/base.js';
export { DevObserver } from './observer/dev.js';

// Vector store
export type { VectorStoreAdapter, VectorDocument, ScoredDocument, DeleteParams } from './vectorstore.js';
export { createMemoryHandlers } from './vectorstore.js';

// Logger
export { createLogger, logger } from './logger.js';
export type { Logger, LogLevel, LogEntry } from './logger.js';

// Zod (re-export for generated code)
export { z } from 'zod';
