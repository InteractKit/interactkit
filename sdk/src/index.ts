// Decorators
export { Entity, Hook, Configurable, Component, Ref, getEntityMeta, getHookMeta, getConfigurableMeta, getRefMeta } from './entity/decorators.js';
export type { ConfigurableOptions } from './entity/decorators.js';

// Validation — @Secret is ours, everything else from class-validator
export { Secret, getSecretMeta } from './entity/validators.js';

// Base types
export { BaseEntity } from './entity/types.js';
export type { EntityOptions, EntityInstance, StateStore } from './entity/types.js';
export type { EntityRef } from './entity/types.js';

// Stream
export type { EntityStream } from './entity/stream.js';
export { EntityStreamImpl } from './entity/stream.js';

// Hook input types
export type { CronInput, EventInput, InitInput, TickInput, WebSocketInput, HttpInput } from './hooks/types.js';

// Hook runner interface + built-in runners
export type { HookRunner } from './hooks/runner.js';
export { InitRunner } from './hooks/runners/init.js';
export { TickRunner } from './hooks/runners/tick.js';
export { CronRunner } from './hooks/runners/cron.js';
export { EventRunner } from './hooks/runners/event.js';
// WebSocketRunner, HttpRunner — provided by extension packages (e.g. @interactkit/http, @interactkit/ws)

// Adapter interfaces
export type { PubSubAdapter } from './pubsub/adapter.js';
export type { DatabaseAdapter } from './database/adapter.js';
export type { LogAdapter } from './logger/adapter.js';

// Adapter implementations
export { InProcessBusAdapter } from './pubsub/in-process.js';
export { RedisPubSubAdapter } from './pubsub/redis.js';
export { PrismaDatabaseAdapter } from './database/prisma.js';
export { ConsoleLogAdapter } from './logger/console.js';

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
  LLMEntity, Context, Executor, LLMTool, LLMVisible, LLMExecutionTrigger,
  getLLMEntityMeta, getLLMContextProp, getLLMExecutorProp, getLLMTools, getLLMVisible, getLLMTriggers,
  LLMContext,
} from './llm/index.js';
export type { LLMEntityOptions, LLMToolOptions, LLMMessage, LLMExecutionTriggerParams } from './llm/index.js';

// Registry singleton
export { setRegistry, getRegistry } from './registry.js';

// Config
export { resolveRedisConfig, resolveDatabaseConfig } from './config.js';
export type { RedisConfig, DatabaseConfig } from './config.js';

// Zod — re-exported so consumers don't need to install separately
export { z } from 'zod';
