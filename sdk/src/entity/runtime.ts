import { randomUUID } from 'node:crypto';
import { getEntityMeta, getHookMeta, getRefMeta, getStreamMeta, getStateMeta } from './decorators.js';
import { EntityStreamImpl } from './stream.js';
import type { BaseEntity, EntityClass, EntityConstructor, EntityInstance } from './types.js';
import type { LogAdapter } from '../logger/adapter.js';
import type { PubSubAdapter } from '../pubsub/adapter.js';
import { EventBus } from '../events/bus.js';
import { EventDispatcher } from '../events/dispatcher.js';
import { InProcessBusAdapter } from '../pubsub/in-process.js';
import { getRegistry } from '../registry.js';
import { getMCPMeta } from '../mcp/decorators.js';
import { MCPClientWrapper } from '../mcp/client.js';
import { getLLMTools, setLLMTools } from '../llm/decorators.js';
import { type InfraContext, resolveInfra } from './infra.js';
import { createComponentProxy } from './proxy.js';
import { getPropertyNames, getMethodNames } from './reflect.js';
import { wireReactiveState } from './reactive-state.js';

// ─── Public types ─────────────────────────────────────────

export interface RuntimeOptions {
  registry?: any;
  logger?: LogAdapter;
  pubsub?: PubSubAdapter;
}

// ─── Runtime ──────────────────────────────────────────────

/**
 * Starts entities one by one. Each entity gets a deterministic ID based
 * on its type, registers with the dispatcher, and listens on the event bus.
 *
 * Cross-entity calls route through pubsub by entity type. Entities in the
 * same Runtime are wired directly; entities in other processes communicate
 * via Redis.
 *
 * Usage:
 *   const rt = new Runtime({ registry, pubsub });
 *   await rt.add(Agent);
 *   await rt.add(Brain);
 *   await rt.start();
 */
export class Runtime {
  private registry: any;
  private infra: InfraContext;
  private bus: EventBus;
  private dispatcher: EventDispatcher;
  private entities = new Map<string, EntityInstance>();
  private busCache = new Map<string, EventBus>();
  private inProcessRunners: Array<{ stop(): Promise<void> }> = [];
  private hookChannels: string[] = [];
  private mcpClients: MCPClientWrapper[] = [];
  private started = false;

  constructor(options: RuntimeOptions = {}) {
    this.registry = options.registry ?? getRegistry();
    this.infra = {
      pubsub: options.pubsub ?? new InProcessBusAdapter(),
      logger: options.logger,
    };
    this.bus = new EventBus(this.infra.pubsub, this.infra.logger);
    this.dispatcher = new EventDispatcher(this.registry);
  }

  /**
   * Add an entity to this runtime. Instantiates it, registers with the
   * dispatcher, and sets up event bus listeners. Can be called multiple
   * times before start().
   */
  async add(EntityCls: EntityClass): Promise<BaseEntity> {
    const Cls = EntityCls as EntityConstructor;
    const meta = getEntityMeta(Cls);
    if (!meta) throw new Error(`${Cls.name} missing @Entity decorator`);

    // Deterministic ID based on entity type — same across processes
    const entityId = meta.type;

    // Resolve infra (entity can override pubsub/db/logger)
    const infra = resolveInfra(meta, this.infra);
    const bus = infra.pubsub === this.infra.pubsub ? this.bus : new EventBus(infra.pubsub, infra.logger);

    // Instantiate
    const instance = new Cls();
    Object.defineProperty(instance, 'id', { value: entityId, writable: false, configurable: false });

    // Registry info
    const entityReg = this.registry?.entities?.[meta.type];
    const streamNames: string[] = entityReg?.streams ?? [];

    // State
    const stateMeta = getStateMeta(Cls);
    const stateKeys: string[] = [...stateMeta.keys()];

    const entityInstance: EntityInstance = {
      id: entityId,
      type: meta.type,
      entity: instance,
      children: new Map(),
    };

    // Wire streams
    const streamMetaSet = getStreamMeta(Cls);
    const propertyNames = getPropertyNames(Cls, entityReg);
    for (const propName of propertyNames) {
      if (propName === 'id') continue;
      if (streamNames.includes(propName) || streamMetaSet.has(propName)) {
        (instance as any)[propName] = new EntityStreamImpl();
      }
    }

    // Wire @Component and @Ref as proxies — resolve each target's pubsub
    const refMetaSet = getRefMeta(Cls);
    const componentDefs: Array<{ property: string; type: string }> = entityReg?.components ?? [];

    const getBusForType = (targetType: string): EventBus => {
      const prototype = Cls.prototype;
      const allProps = getPropertyNames(Cls, entityReg);
      for (const propName of allProps) {
        const propType = Reflect.getMetadata('design:type', prototype, propName);
        const propMeta = propType ? getEntityMeta(propType) : undefined;
        if (propMeta?.type === targetType && propMeta.pubsub) {
          const adapterKey = propMeta.pubsub.name;
          if (!this.busCache.has(adapterKey)) {
            const adapter = new propMeta.pubsub();
            this.busCache.set(adapterKey, new EventBus(adapter, this.infra.logger));
          }
          return this.busCache.get(adapterKey)!;
        }
      }
      return bus;
    };

    for (const comp of componentDefs) {
      (instance as any)[comp.property] = createComponentProxy(
        comp.type, comp.type, entityId, getBusForType(comp.type),
      );
    }

    for (const refProp of refMetaSet) {
      const refType = Reflect.getMetadata('design:type', Cls.prototype, refProp);
      const refEntityMeta = refType ? getEntityMeta(refType) : undefined;
      if (refEntityMeta) {
        (instance as any)[refProp] = createComponentProxy(
          refEntityMeta.type, refEntityMeta.type, entityId, getBusForType(refEntityMeta.type),
        );
      }
    }

    // Hydrate state
    if (infra.database) {
      const savedState = await infra.database.get(entityId);
      if (savedState) {
        for (const key of stateKeys) {
          if (key in savedState) (instance as any)[key] = savedState[key];
        }
      }
    }

    // Reactive state
    await wireReactiveState(instance, stateKeys, entityId, this.dispatcher.instanceId, infra);

    // Register methods with dispatcher
    const methods = new Map<string, Function>();
    const hookEntries = getHookMeta(Cls);
    const hookMethodNames = new Set(hookEntries.map(h => h.method));
    for (const name of getMethodNames(Cls)) {
      if (hookMethodNames.has(name)) continue;
      const method = (instance as any)[name];
      if (typeof method === 'function') {
        methods.set(`${meta.type}.${name}`, method);
      }
    }

    this.dispatcher.register(entityId, instance, meta.type, methods);
    await bus.listen(entityId, (envelope) => this.dispatcher.dispatch(envelope));

    // MCP setup
    const mcpMeta = getMCPMeta(Cls);
    if (mcpMeta) {
      const client = new MCPClientWrapper(mcpMeta);
      await client.connect();
      this.mcpClients.push(client);
      const mcpTools = await client.listTools();
      (instance as any).__mcpClient = client;
      const existingTools = getLLMTools(Cls);
      for (const mcpTool of mcpTools) {
        existingTools.set(mcpTool.name, { description: mcpTool.description, name: mcpTool.name });
        const toolName = mcpTool.name;
        (instance as any)[toolName] = async (args: Record<string, unknown>) => client.callTool(toolName, args);
        this.dispatcher.addMethod(entityId, `${meta.type}.${toolName}`, (instance as any)[toolName]);
      }
      setLLMTools(Cls, existingTools);
    }

    this.entities.set(entityId, entityInstance);
    return instance;
  }

  /**
   * Start all hooks and finalize wiring. Call after all add() calls.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Wire streams between co-located entities (parent can access child streams)
    for (const [, entityInst] of this.entities) {
      const EntityCls = entityInst.entity.constructor as EntityConstructor;
      const entityReg = this.registry?.entities?.[entityInst.type];
      const componentDefs: Array<{ property: string; type: string }> = entityReg?.components ?? [];

      for (const comp of componentDefs) {
        const childInst = this.entities.get(comp.type);
        if (!childInst) continue;

        const proxy = (entityInst.entity as any)[comp.property];
        if (!proxy) continue;

        const ChildCls = childInst.entity.constructor as EntityConstructor;
        const childStreamMeta = getStreamMeta(ChildCls);
        const childReg = this.registry?.entities?.[childInst.type];
        const childRegStreams: string[] = childReg?.streams ?? [];
        const allStreams = new Set([...childStreamMeta, ...childRegStreams]);

        for (const streamName of allStreams) {
          const stream = (childInst.entity as any)[streamName];
          if (stream) {
            Object.defineProperty(proxy, streamName, { value: stream, writable: false, configurable: false });
          }
        }
      }
    }

    // Start hooks
    for (const [entityId, entityInst] of this.entities) {
      const EntityCls = entityInst.entity.constructor as EntityConstructor;
      const hooks = getHookMeta(EntityCls);

      for (const hook of hooks) {
        const method = (entityInst.entity as any)[hook.method];
        if (typeof method !== 'function') continue;

        if (hook.inProcess) {
          const runner = new hook.runnerClass();
          this.inProcessRunners.push(runner);
          await runner.start(
            (data) => method.call(entityInst.entity, data),
            { ...hook.config, entityId, firstBoot: true },
          );
        } else {
          const channel = `hook:${entityInst.type}.${hook.method}`;
          this.hookChannels.push(channel);
          await this.infra.pubsub.consume(channel, async (message) => {
            const data = JSON.parse(message);
            try {
              this.infra.logger?.event({
                id: '', source: 'hook-server', target: entityId,
                type: `${entityInst.type}.${hook.method}`, payload: data, timestamp: Date.now(),
              });
              await method.call(entityInst.entity, data);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              this.infra.logger?.error(
                { id: '', source: 'hook-server', target: entityId, type: `${entityInst.type}.${hook.method}`, payload: data, timestamp: Date.now() },
                error,
              );
            }
          });
        }
      }
    }
  }

  get size() { return this.entities.size; }

  getEntity(type: string): BaseEntity | undefined {
    return this.entities.get(type)?.entity;
  }

  async shutdown(): Promise<void> {
    for (const runner of this.inProcessRunners) await runner.stop();
    for (const ch of this.hookChannels) await this.infra.pubsub.stopConsuming(ch);
    for (const client of this.mcpClients) await client.close();
    await this.bus.destroy();
    for (const b of this.busCache.values()) await b.destroy();
  }
}

// ─── Legacy boot() — wraps Runtime for backward compatibility ──

export interface BootOptions {
  registry?: any;
  idGenerator?: () => string;
  logger?: LogAdapter;
}

export interface RuntimeContext {
  root: BaseEntity;
  bus: EventBus;
  dispatcher: EventDispatcher;
  entities: Map<string, EntityInstance>;
  shutdown(): Promise<void>;
}

export async function boot(
  RootEntityClass: EntityClass,
  options?: BootOptions,
): Promise<RuntimeContext> {
  const entityMeta = getEntityMeta(RootEntityClass as EntityConstructor);
  if (!entityMeta) throw new Error('Root class must have @Entity decorator');

  const idGen = options?.idGenerator ?? (() => randomUUID().slice(0, 8));
  const registry = options?.registry ?? getRegistry();

  const rootInfra = resolveInfra(entityMeta, {
    pubsub: new InProcessBusAdapter(),
    logger: options?.logger,
  });

  const busMap = new Map<PubSubAdapter, EventBus>();
  const getBus = (infra: InfraContext): EventBus => {
    let bus = busMap.get(infra.pubsub);
    if (!bus) {
      bus = new EventBus(infra.pubsub, infra.logger);
      busMap.set(infra.pubsub, bus);
    }
    return bus;
  };

  const dispatcher = new EventDispatcher(registry);
  const allEntities = new Map<string, EntityInstance>();

  const typeToClass = new Map<string, EntityConstructor>();
  function scanEntityClasses(Cls: EntityConstructor, visited = new Set<string>()) {
    const m = getEntityMeta(Cls);
    if (!m || visited.has(m.type)) return;
    visited.add(m.type);
    typeToClass.set(m.type, Cls);
    for (const key of Object.getOwnPropertyNames(Cls.prototype)) {
      const dt = Reflect.getMetadata('design:type', Cls.prototype, key);
      if (dt && typeof dt === 'function' && getEntityMeta(dt)) scanEntityClasses(dt, visited);
    }
    const tempInst = new Cls();
    for (const key of Object.getOwnPropertyNames(tempInst)) {
      const dt = Reflect.getMetadata('design:type', Cls.prototype, key);
      if (dt && typeof dt === 'function' && getEntityMeta(dt)) scanEntityClasses(dt, visited);
    }
  }
  scanEntityClasses(RootEntityClass as EntityConstructor);

  async function instantiateEntity(
    EntityClass: EntityConstructor, parentId: string | undefined,
    parentInfra: InfraContext, parentIdPath: string,
  ): Promise<EntityInstance> {
    const meta = getEntityMeta(EntityClass);
    if (!meta) throw new Error(`Class ${EntityClass.name} missing @Entity decorator`);

    const segment = `${meta.type}:${idGen()}`;
    const fullId = parentIdPath ? `${parentIdPath}/${segment}` : segment;
    const infra = resolveInfra(meta, parentInfra);
    const bus = getBus(infra);

    const instance = new EntityClass();
    Object.defineProperty(instance, 'id', { value: fullId, writable: false, configurable: false });

    const entityReg = registry?.entities?.[meta.type];
    const componentDefs: Array<{ property: string; type: string }> = entityReg?.components ?? [];
    const componentPropNames = new Set(componentDefs.map((c: any) => c.property));
    const componentPropToType = new Map(componentDefs.map((c: any) => [c.property, c.type]));
    const streamNames: string[] = entityReg?.streams ?? [];
    const refNames: string[] = entityReg?.refs ?? [];

    const stateMeta = getStateMeta(EntityClass);
    const stateKeys: string[] = [...stateMeta.keys()];

    const entityInstance: EntityInstance = { id: fullId, type: meta.type, entity: instance, parentId, children: new Map() };

    const prototype = Object.getPrototypeOf(instance);
    const propertyNames = getPropertyNames(EntityClass, entityReg);

    for (const propName of propertyNames) {
      if (propName === 'id') continue;
      const streamMetaSet = getStreamMeta(EntityClass);
      if (streamNames.includes(propName) || streamMetaSet.has(propName)) {
        (instance as any)[propName] = new EntityStreamImpl();
        continue;
      }
      const refMetaSet = getRefMeta(EntityClass);
      if (refNames.includes(propName) || refMetaSet.has(propName)) continue;

      let compClass: EntityConstructor | undefined;
      let compEntityMeta: ReturnType<typeof getEntityMeta> | undefined;
      const propType = Reflect.getMetadata('design:type', prototype, propName);
      if (propType && getEntityMeta(propType)) { compClass = propType; compEntityMeta = getEntityMeta(propType); }
      else if (componentPropNames.has(propName)) {
        const compTypeName = componentPropToType.get(propName);
        if (compTypeName) { compClass = typeToClass.get(compTypeName); compEntityMeta = compClass ? getEntityMeta(compClass) : undefined; }
      }
      if (compClass && compEntityMeta) {
        const childInstance = await instantiateEntity(compClass, fullId, infra, fullId);
        entityInstance.children.set(propName, childInstance);
        (instance as any)[propName] = createComponentProxy(childInstance.id, compEntityMeta.type, fullId, getBus(resolveInfra(compEntityMeta, infra)));
        continue;
      }
    }

    if (infra.database) {
      const savedState = await infra.database.get(fullId);
      if (savedState) { for (const key of stateKeys) { if (key in savedState) (instance as any)[key] = savedState[key]; } }
    }

    await wireReactiveState(instance, stateKeys, fullId, dispatcher.instanceId, infra);

    const methods = new Map<string, Function>();
    const hookEntries = getHookMeta(EntityClass);
    const hookMethodNames = new Set(hookEntries.map(h => h.method));
    for (const name of getMethodNames(EntityClass)) {
      if (hookMethodNames.has(name)) continue;
      const method = (instance as any)[name];
      if (typeof method === 'function') methods.set(`${meta.type}.${name}`, method);
    }

    dispatcher.register(fullId, instance, meta.type, methods);
    await bus.listen(fullId, (envelope) => dispatcher.dispatch(envelope));

    allEntities.set(fullId, entityInstance);
    return entityInstance;
  }

  const rootInstance = await instantiateEntity(RootEntityClass as EntityConstructor, undefined, rootInfra, '');

  for (const [entityId, entityInst] of allEntities) {
    const EC = entityInst.entity.constructor as EntityConstructor;
    const refMetaSet = getRefMeta(EC);
    if (refMetaSet.size === 0 || !entityInst.parentId) continue;
    const parent = allEntities.get(entityInst.parentId);
    if (!parent) continue;
    for (const refPropName of refMetaSet) {
      const refType = Reflect.getMetadata('design:type', EC.prototype, refPropName);
      const refEntityMeta = refType ? getEntityMeta(refType) : undefined;
      if (!refEntityMeta?.type) continue;
      for (const [, sibInstance] of parent.children) {
        if (sibInstance.type === refEntityMeta.type) {
          if (refPropName === 'context' && sibInstance.entity.constructor.name === 'ConversationContext') {
            (entityInst.entity as any)[refPropName] = sibInstance.entity;
          } else {
            const sibInfra = resolveInfra(getEntityMeta(sibInstance.entity.constructor as EntityConstructor) ?? { type: sibInstance.type }, rootInfra);
            (entityInst.entity as any)[refPropName] = createComponentProxy(sibInstance.id, sibInstance.type, entityId, getBus(sibInfra));
          }
          break;
        }
      }
    }
  }

  for (const [, entityInst] of allEntities) {
    for (const [childPropName, childInst] of entityInst.children) {
      const ChildClass = childInst.entity.constructor as EntityConstructor;
      const childStreamMeta = getStreamMeta(ChildClass);
      const childReg = registry?.entities?.[childInst.type];
      const childRegStreams: string[] = childReg?.streams ?? [];
      const allStreamNames = new Set([...childStreamMeta, ...childRegStreams]);
      if (allStreamNames.size === 0) continue;
      const proxy = (entityInst.entity as any)[childPropName];
      if (!proxy) continue;
      for (const streamName of allStreamNames) {
        const stream = (childInst.entity as any)[streamName];
        if (stream) Object.defineProperty(proxy, streamName, { value: stream, writable: false, configurable: false });
      }
    }
  }

  const mcpClients: MCPClientWrapper[] = [];
  for (const [, entityInst] of allEntities) {
    const EC = entityInst.entity.constructor as EntityConstructor;
    const mcpMeta = getMCPMeta(EC);
    if (!mcpMeta) continue;
    const client = new MCPClientWrapper(mcpMeta);
    await client.connect();
    mcpClients.push(client);
    const mcpTools = await client.listTools();
    (entityInst.entity as any).__mcpClient = client;
    const existingTools = getLLMTools(EC);
    for (const mcpTool of mcpTools) {
      existingTools.set(mcpTool.name, { description: mcpTool.description, name: mcpTool.name });
      const toolName = mcpTool.name;
      (entityInst.entity as any)[toolName] = async (args: Record<string, unknown>) => client.callTool(toolName, args);
    }
    setLLMTools(EC, existingTools);
    for (const mcpTool of mcpTools) {
      dispatcher.addMethod(entityInst.id, `${entityInst.type}.${mcpTool.name}`, (entityInst.entity as any)[mcpTool.name]);
    }
  }

  const inProcessRunners: Array<{ stop(): Promise<void> }> = [];
  const hookChannels: string[] = [];
  for (const [entityId, entityInst] of allEntities) {
    const EC = entityInst.entity.constructor as EntityConstructor;
    const hooks = getHookMeta(EC);
    for (const hook of hooks) {
      const method = (entityInst.entity as any)[hook.method];
      if (typeof method !== 'function') continue;
      if (hook.inProcess) {
        const runner = new hook.runnerClass();
        inProcessRunners.push(runner);
        await runner.start((data) => method.call(entityInst.entity, data), { ...hook.config, entityId, firstBoot: entityInst.parentId === undefined });
      } else {
        const channel = `hook:${entityInst.type}.${hook.method}`;
        hookChannels.push(channel);
        await rootInfra.pubsub.consume(channel, async (message) => {
          const data = JSON.parse(message);
          try {
            rootInfra.logger?.event({ id: '', source: 'hook-server', target: entityId, type: `${entityInst.type}.${hook.method}`, payload: data, timestamp: Date.now() });
            await method.call(entityInst.entity, data);
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            rootInfra.logger?.error({ id: '', source: 'hook-server', target: entityId, type: `${entityInst.type}.${hook.method}`, payload: data, timestamp: Date.now() }, error);
          }
        });
      }
    }
  }

  return {
    root: rootInstance.entity,
    bus: getBus(rootInfra),
    dispatcher,
    entities: allEntities,
    async shutdown() {
      for (const runner of inProcessRunners) await runner.stop();
      for (const ch of hookChannels) await rootInfra.pubsub.stopConsuming(ch);
      for (const client of mcpClients) await client.close();
      for (const bus of busMap.values()) await bus.destroy();
    },
  };
}
