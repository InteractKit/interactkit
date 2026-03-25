import { randomUUID } from 'node:crypto';
import { getEntityMeta, getHookMeta, getRefMeta } from './decorators.js';
import { EntityStreamImpl } from './stream.js';
import type { BaseEntity, EntityInstance, EntityOptions } from './types.js';
import type { DatabaseAdapter } from '../database/adapter.js';
import type { PubSubAdapter } from '../pubsub/adapter.js';
import type { LogAdapter } from '../logger/adapter.js';
import { EventBus } from '../events/bus.js';
import { EventDispatcher } from '../events/dispatcher.js';
import { InProcessBusAdapter } from '../pubsub/in-process.js';
import type { EventEnvelope } from '../events/types.js';
import { getRegistry } from '../registry.js';

// ─── Public types ─────────────────────────────────────────

export interface BootOptions {
  registry?: any;
  idGenerator?: () => string;
}

export interface RuntimeContext {
  root: BaseEntity;
  bus: EventBus;
  dispatcher: EventDispatcher;
  entities: Map<string, EntityInstance>;
  shutdown(): Promise<void>;
}

interface InfraContext {
  pubsub: PubSubAdapter;
  database?: DatabaseAdapter;
  logger?: LogAdapter;
}

// ─── boot() ───────────────────────────────────────────────

/**
 * Boot the entity system from a root @Entity class.
 * Instantiates all entities, wires proxies, sets up event bus, calls init hooks.
 */
export async function boot(
  RootEntityClass: new () => BaseEntity,
  options?: BootOptions,
): Promise<RuntimeContext> {
  const entityMeta = getEntityMeta(RootEntityClass);
  if (!entityMeta) throw new Error('Root class must have @Entity decorator');

  const idGen = options?.idGenerator ?? (() => randomUUID().slice(0, 8));
  const registry = options?.registry ?? getRegistry();

  // Resolve root infra
  const rootInfra = resolveInfra(entityMeta, {
    pubsub: new InProcessBusAdapter(),
  });

  // Bus map: reuse EventBus instances per PubSubAdapter
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

  // Pre-scan: build entityType → class map by following design:type metadata
  const typeToClass = new Map<string, new () => BaseEntity>();
  function scanEntityClasses(Cls: new () => BaseEntity, visited = new Set<string>()) {
    const m = getEntityMeta(Cls);
    if (!m || visited.has(m.type)) return;
    visited.add(m.type);
    typeToClass.set(m.type, Cls);
    // Follow design:type on prototype for decorated properties
    for (const key of Object.getOwnPropertyNames(Cls.prototype)) {
      const dt = Reflect.getMetadata('design:type', Cls.prototype, key);
      if (dt && typeof dt === 'function' && getEntityMeta(dt)) {
        scanEntityClasses(dt, visited);
      }
    }
    // Follow design:type on a temp instance for instance properties with decorators
    const tempInst = new Cls();
    for (const key of Object.getOwnPropertyNames(tempInst)) {
      const dt = Reflect.getMetadata('design:type', Cls.prototype, key);
      if (dt && typeof dt === 'function' && getEntityMeta(dt)) {
        scanEntityClasses(dt, visited);
      }
    }
  }
  scanEntityClasses(RootEntityClass);

  // Recursive entity instantiation
  async function instantiateEntity(
    EntityClass: new () => BaseEntity,
    parentId: string | undefined,
    parentInfra: InfraContext,
    parentIdPath: string,
  ): Promise<EntityInstance> {
    const meta = getEntityMeta(EntityClass);
    if (!meta) throw new Error(`Class ${EntityClass.name} missing @Entity decorator`);

    // ID generation
    const segment = `${meta.type}:${idGen()}`;
    const fullId = parentIdPath ? `${parentIdPath}/${segment}` : segment;

    // Resolve infra (own overrides or inherit from parent)
    const infra = resolveInfra(meta, parentInfra);
    const bus = getBus(infra);

    // Instantiate
    const instance = new EntityClass();
    Object.defineProperty(instance, 'id', { value: fullId, writable: false, configurable: false });

    // Determine property roles from registry
    const entityReg = registry?.entities?.[meta.type];
    const componentDefs: Array<{ property: string; type: string }> = entityReg?.components ?? [];
    const componentPropNames = new Set(componentDefs.map((c: any) => c.property));
    const componentPropToType = new Map(componentDefs.map((c: any) => [c.property, c.type]));
    const streamNames: string[] = entityReg?.streams ?? [];
    const refNames: string[] = entityReg?.refs ?? [];

    // Collect state keys for persistence
    const stateKeys: string[] = [];

    const entityInstance: EntityInstance = {
      id: fullId,
      type: meta.type,
      entity: instance,
      parentId,
      children: new Map(),
    };

    // Classify and wire properties
    const prototype = Object.getPrototypeOf(instance);
    const propertyNames = getPropertyNames(EntityClass, entityReg);

    for (const propName of propertyNames) {
      if (propName === 'id') continue;

      if (streamNames.includes(propName)) {
        // Wire EntityStream
        (instance as any)[propName] = new EntityStreamImpl();
        continue;
      }

      // Check both registry refs AND @Ref() decorator metadata
      const refMetaSet = getRefMeta(EntityClass);
      if (refNames.includes(propName) || refMetaSet.has(propName)) {
        // Refs are wired after all siblings are instantiated (deferred)
        continue;
      }

      // Check if this property is a component
      let compClass: (new () => BaseEntity) | undefined;
      let compEntityMeta: ReturnType<typeof getEntityMeta> | undefined;

      // Try design:type metadata first (available if property has a decorator)
      const propType = Reflect.getMetadata('design:type', prototype, propName);
      if (propType && getEntityMeta(propType)) {
        compClass = propType;
        compEntityMeta = getEntityMeta(propType);
      }
      // Fallback: resolve from registry + typeToClass map
      else if (componentPropNames.has(propName)) {
        const compTypeName = componentPropToType.get(propName);
        if (compTypeName) {
          compClass = typeToClass.get(compTypeName);
          compEntityMeta = compClass ? getEntityMeta(compClass) : undefined;
        }
      }

      if (compClass && compEntityMeta) {
        // Recursively instantiate child entity
        const childInstance = await instantiateEntity(compClass, fullId, infra, fullId);
        entityInstance.children.set(propName, childInstance);

        // Wire component proxy
        (instance as any)[propName] = createComponentProxy(
          childInstance.id,
          compEntityMeta.type,
          fullId,
          getBus(resolveInfra(compEntityMeta, infra)),
        );
        continue;
      }

      // State property
      stateKeys.push(propName);
    }

    // Hydrate state from database
    if (infra.database) {
      const savedState = await infra.database.get(fullId);
      if (savedState) {
        for (const key of stateKeys) {
          if (key in savedState) {
            (instance as any)[key] = savedState[key];
          }
        }
      }
    }

    // Build method map for dispatcher
    const methods = new Map<string, Function>();
    for (const name of getMethodNames(EntityClass)) {
      const hookMethods = getHookMeta(EntityClass);
      if (hookMethods.includes(name)) continue; // skip hooks
      const method = (instance as any)[name];
      if (typeof method === 'function') {
        methods.set(`${meta.type}.${name}`, method);
      }
    }

    // Register with dispatcher and bus
    dispatcher.register(fullId, instance, meta.type, methods, infra.database, stateKeys);
    await bus.listen(fullId, (envelope) => dispatcher.dispatch(envelope));

    allEntities.set(fullId, entityInstance);
    return entityInstance;
  }

  // Boot the root
  const rootInstance = await instantiateEntity(RootEntityClass, undefined, rootInfra, '');

  // Wire EntityRef properties (sibling lookups)
  for (const [entityId, entityInst] of allEntities) {
    const EntityClass = entityInst.entity.constructor as new () => BaseEntity;
    const refMetaSet = getRefMeta(EntityClass);
    if (refMetaSet.size === 0) continue;

    // Find this entity's parent
    if (!entityInst.parentId) continue;
    const parent = allEntities.get(entityInst.parentId);
    if (!parent) continue;

    for (const refPropName of refMetaSet) {
      // Get the target entity type from design:type metadata
      const refType = Reflect.getMetadata('design:type', EntityClass.prototype, refPropName);
      const refEntityMeta = refType ? getEntityMeta(refType) : undefined;
      const targetType = refEntityMeta?.type;

      if (!targetType) continue;

      // Find the sibling with matching entity type
      for (const [, sibInstance] of parent.children) {
        if (sibInstance.type === targetType) {
          const sibInfra = resolveInfra(
            getEntityMeta(sibInstance.entity.constructor as new () => BaseEntity) ?? { type: sibInstance.type },
            rootInfra,
          );
          (entityInst.entity as any)[refPropName] = createComponentProxy(
            sibInstance.id,
            sibInstance.type,
            entityId,
            getBus(sibInfra),
          );
          break;
        }
      }
    }
  }

  // Call InitInput hooks (depth-first)
  for (const [entityId, entityInst] of allEntities) {
    const EntityClass = entityInst.entity.constructor as new () => BaseEntity;
    const hookMethodNames = getHookMeta(EntityClass);

    for (const methodName of hookMethodNames) {
      const method = (entityInst.entity as any)[methodName];
      if (typeof method !== 'function') continue;

      // Check if this is an init hook by convention (parameter name or registry)
      const entityReg = registry?.entities?.[entityInst.type];
      const hookDef = entityReg?.hooks?.find((h: any) => h.method === methodName);

      if (hookDef?.type === 'InitInput' || methodName.toLowerCase().includes('init')) {
        const hadState = entityInst.parentId !== undefined; // simplified check
        await method.call(entityInst.entity, {
          entityId,
          firstBoot: !hadState,
        });
      }
    }
  }

  const rootBus = getBus(rootInfra);

  return {
    root: rootInstance.entity,
    bus: rootBus,
    dispatcher,
    entities: allEntities,
    async shutdown() {
      for (const bus of busMap.values()) {
        await bus.destroy();
      }
    },
  };
}

// ─── Component Proxy ──────────────────────────────────────

function createComponentProxy(
  targetEntityId: string,
  entityType: string,
  sourceEntityId: string,
  bus: EventBus,
): any {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'id') return targetEntityId;
        if (typeof prop === 'symbol') return undefined;

        // Return an async function that routes through the event bus
        return async (...args: unknown[]) => {
          const envelope: EventEnvelope = {
            id: randomUUID(),
            source: sourceEntityId,
            target: targetEntityId,
            type: `${entityType}.${String(prop)}`,
            payload: args[0],
            timestamp: Date.now(),
          };
          return bus.request(envelope);
        };
      },
    },
  );
}

// ─── Infra Resolution ─────────────────────────────────────

function resolveInfra(meta: EntityOptions, parentInfra: InfraContext): InfraContext {
  return {
    pubsub: meta.pubsub ? new meta.pubsub() : parentInfra.pubsub,
    database: meta.database ? new meta.database() : parentInfra.database,
    logger: meta.logger ? new meta.logger() : parentInfra.logger,
  };
}

// ─── Reflection helpers ───────────────────────────────────

function getPropertyNames(EntityClass: new () => BaseEntity, entityReg?: any): string[] {
  const names = new Set<string>();
  const instance = new EntityClass();

  // Own properties from the instance (those with initializers)
  for (const key of Object.getOwnPropertyNames(instance)) {
    if (key !== 'id') names.add(key);
  }

  // Properties from registry (catches `!` properties with no initializer)
  if (entityReg) {
    for (const comp of entityReg.components ?? []) names.add(comp.property ?? comp);
    for (const stream of entityReg.streams ?? []) names.add(stream);
    for (const ref of entityReg.refs ?? []) names.add(ref);
    // State properties from registry state schema
    if (entityReg.state?.shape) {
      for (const key of Object.keys(entityReg.state.shape)) names.add(key);
    }
  }

  // Properties with design:type metadata (from decorators)
  const prototype = EntityClass.prototype;
  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === 'constructor') continue;
    const designType = Reflect.getMetadata('design:type', prototype, key);
    if (designType && typeof designType === 'function' && designType !== Function) {
      names.add(key);
    }
  }

  return [...names];
}

function getMethodNames(EntityClass: new () => BaseEntity): string[] {
  const names: string[] = [];
  const prototype = EntityClass.prototype;
  for (const key of Object.getOwnPropertyNames(prototype)) {
    if (key === 'constructor') continue;
    const desc = Object.getOwnPropertyDescriptor(prototype, key);
    if (desc && typeof desc.value === 'function') {
      names.push(key);
    }
  }
  return names;
}
