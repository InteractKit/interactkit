// Decorators
export { Entity, Hook, Configurable, State, Component, Ref, Stream, Describe, getEntityMeta, getHookMeta, getConfigurableMeta, getStateMeta, getRefMeta, getStreamMeta, getDescribeMethod } from './entity/decorators.js';
export type { ConfigurableOptions, StateOptions, EntityMeta, HookMetaEntry } from './entity/decorators.js';

// Validation — @Secret marks fields as sensitive (masked in UI/logs)
export { Secret, getSecretMeta } from './entity/validators.js';

// Entity context (runtime metadata access)
export { EntityContextManager } from './entity/context.js';
export type { CallerInfo } from './entity/context.js';

// Base types
export { BaseEntity } from './entity/types.js';
export { LLMEntity } from './llm/base.js';
export type { EntityOptions, EntityConstructor, EntityClass, EntityInstance, StateStore } from './entity/types.js';
export type { EntityRef } from './entity/types.js';

// Stream
export type { EntityStream } from './entity/stream.js';
export { EntityStreamImpl } from './entity/stream.js';

// Hook namespaces (each contains .Input + .Runner(config))
export { Init } from './hooks/init.js';
export { Tick } from './hooks/tick.js';
export { Cron } from './hooks/cron.js';
export { Event } from './hooks/event.js';

// Hook runner interface (for extension packages to implement custom hooks)
export type { HookRunner, HookHandler } from './hooks/runner.js';

// Adapter interfaces
export type { PubSubAdapter } from './pubsub/adapter.js';
export type { DatabaseAdapter } from './database/adapter.js';
export type { LogAdapter } from './logger/adapter.js';

// Adapter implementations
export { InProcessBusAdapter } from './pubsub/in-process.js';
export { RedisPubSubAdapter } from './pubsub/redis.js';
export { PrismaDatabaseAdapter } from './database/prisma.js';
export { ConsoleLogAdapter } from './logger/console.js';
export { DevLogAdapter } from './logger/dev.js';

// Event types
export type { EventEnvelope } from './events/types.js';

// Event bus + dispatcher
export { EventBus } from './events/bus.js';
export { EventDispatcher } from './events/dispatcher.js';

// Runtime
export { boot } from './entity/runtime.js';
export type { BootOptions, RuntimeContext } from './entity/runtime.js';

// LLM
export {
  Context, Executor, Tool, LLMExecutionTrigger,
  getLLMEntityMeta, getLLMContextProp, getLLMExecutorProp, getLLMTools, getLLMTriggers,
  setLLMTools, LLMContext, ConversationContext,
} from './llm/index.js';
export type { LLMEntityOptions, ToolOptions, LLMMessage, LLMContextOptions, LLMExecutionTriggerParams, ToolCallEvent } from './llm/index.js';

// MCP
export { MCP, getMCPMeta, MCPClientWrapper } from './mcp/index.js';
export type { MCPOptions, MCPTransportConfig, MCPStdioTransport, MCPHttpTransport, MCPSseTransport, MCPToolInfo } from './mcp/index.js';

// Registry singleton
export { setRegistry, getRegistry } from './registry.js';

// Config
export { resolveRedisConfig, resolveDatabaseConfig } from './config.js';
export type { RedisConfig, DatabaseConfig } from './config.js';

// Zod — re-exported so consumers don't need to install separately
export { z } from 'zod';
