// Decorators
export { Entity, Hook, Configurable, State, Component, Ref, Stream, Describe, __Path, Secret,
  getEntityMeta, getHookMeta, getConfigurableMeta, getStateMeta, getRefMeta, getStreamMeta,
  getToolMeta, getPathMeta, getDescribeMethod, getSecretMeta, getPropertyNames, getMethodNames,
} from './entity/decorators/index.js';
export type { ConfigurableOptions, StateOptions, EntityMeta, HookMetaEntry } from './entity/decorators/index.js';

// Entity context (runtime metadata access)
export { EntityContextManager } from './entity/context/index.js';
export type { CallerInfo } from './entity/context/index.js';

// Base types
export { BaseEntity } from './entity/types.js';
export { LLMEntity } from './llm/base.js';
export type { EntityOptions, EntityConstructor, EntityClass, EntityInstance, StateStore } from './entity/types.js';
export type { EntityRef } from './entity/types.js';
export type { Remote } from './entity/proxy/index.js';

// Stream
export type { EntityStream } from './entity/stream/index.js';
export { EntityStreamImpl, DistributedEntityStream, DistributedStreamSubscriber } from './entity/stream/index.js';

// Runner (new boot system)
export { Runner } from './entity/runner/index.js';
export { InstanceFactory } from './entity/runner/instance-factory.js';

// Wrappers
export { BaseWrapper, EntitySession, StateWrapper, ComponentWrapper, RefWrapper, StreamWrapper,
  MethodWrapper, HookWrapper,
} from './entity/wrappers/index.js';
export type { EntityTree, EntityNode, ElementDescriptor, WrapperInfra,
  NamedPubSub, NamedDatabase, NamedLogger,
} from './entity/wrappers/index.js';

// Infra
export { resolveInfra } from './entity/infra/index.js';
export type { InfraContext } from './entity/infra/index.js';

// Hook namespaces
export { Init } from './hooks/init.js';
export { Tick } from './hooks/tick.js';
export { Cron } from './hooks/cron.js';
export { Event } from './hooks/event.js';
export type { HookRunner, HookHandler } from './hooks/runner.js';

// Adapter interfaces
export type { PubSubAdapter, LocalPubSubAdapter, RemotePubSubAdapter } from './pubsub/adapter.js';
export type { DatabaseAdapter } from './database/adapter.js';
export type { LogAdapter } from './logger/adapter.js';

// Adapter implementations
export { InProcessBusAdapter } from './pubsub/in-process.js';
export { RedisPubSubAdapter } from './pubsub/redis.js';
export { PrismaDatabaseAdapter } from './database/prisma.js';
export { ConsoleLogAdapter } from './logger/console.js';
export { DevLogAdapter } from './logger/dev.js';

// Event types + bus
export type { EventEnvelope } from './events/types.js';
export { EventBus } from './events/bus.js';
export { EventDispatcher } from './events/dispatcher.js';

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

// Config
export { resolveRedisConfig, resolveDatabaseConfig } from './config.js';
export type { RedisConfig, DatabaseConfig } from './config.js';

// Zod
export { z } from 'zod';
