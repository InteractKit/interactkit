import type { BaseEntity, EntityConstructor } from '../types.js';
import {
  getStateMeta,
  getHookMeta,
} from '../decorators/index.js';
import { InstanceFactory } from './instance-factory.js';
import {
  BaseWrapper,
  type EntityTree,
  type EntityNode,
  type ElementDescriptor,
} from '../wrappers/base-wrapper.js';
import type { InteractKitConfig } from '../../settings.js';
import { ObserverBridge } from '../../observer/bridge.js';
import { StateWrapper } from '../wrappers/state-wrapper.js';
import { ComponentWrapper } from '../wrappers/component-wrapper.js';
import { RefWrapper } from '../wrappers/ref-wrapper.js';
import { StreamWrapper } from '../wrappers/stream-wrapper.js';
import { MethodWrapper } from '../wrappers/method-wrapper.js';
import { HookWrapper } from '../wrappers/hook-wrapper.js';
import { LLMEntity } from '../../llm/base.js';
const KIND_TO_WRAPPER: Record<ElementDescriptor['kind'], () => BaseWrapper> = {
  state: () => StateWrapper.instance(),
  component: () => ComponentWrapper.instance(),
  ref: () => RefWrapper.instance(),
  stream: () => StreamWrapper.instance(),
  method: () => MethodWrapper.instance(),
  hook: () => HookWrapper.instance(),
};

/**
 * Recursive entity bootstrapper.
 * Configures shared infra, instantiates the entity tree via InstanceFactory,
 * registers elements with singleton wrappers, then initializes them.
 */
export class Runner {
  private factory: InstanceFactory;
  private tree: EntityTree;
  private bridge: ObserverBridge | null = null;
  private config: InteractKitConfig | undefined;

  constructor(tree: EntityTree, config?: InteractKitConfig) {
    this.tree = tree;
    this.config = config;
    this.factory = new InstanceFactory(tree);

    // Replace observers with a bridge so events flow over pubsub
    // to the _observer.ts process where the real observers run.
    if (config?.observers?.length) {
      this.bridge = new ObserverBridge(config.pubsub);
      BaseWrapper.configure(config, this.bridge);
    } else {
      BaseWrapper.configure(config);
    }
    BaseWrapper.setTree(tree);
  }

  /**
   * Boot the full entity tree from a root class.
   */
  async boot(RootClass: EntityConstructor): Promise<{ root: BaseEntity; shutdown: () => Promise<void> }> {
    return this.bootFrom(RootClass, this.tree, this.tree.type);
  }

  /**
   * Boot a slice of the tree between a start path and end paths.
   * startId:  path to start booting from (e.g. "agent")
   * endIds:   paths to stop at — components at these paths are NOT booted,
   *           they become leaf proxies for remote communication.
   *           If omitted, boots the full subtree from startId.
   *
   * Example: bootRange(Agent, "agent", ["agent.worker"])
   *   → boots Agent with worker as a stub, not instantiated locally
   */
  async bootRange(
    EntityClass: EntityConstructor,
    startId: string,
    endIds?: string[],
  ): Promise<{ root: BaseEntity; shutdown: () => Promise<void> }> {
    const node = this.findNodeByPath(this.tree, startId);
    if (!node) throw new Error(`Node at path "${startId}" not found in tree`);

    const pruned = endIds?.length ? this.pruneTree(node, new Set(endIds)) : node;

    return this.bootFrom(EntityClass, pruned, startId);
  }

  private async bootFrom(
    Cls: EntityConstructor,
    node: EntityNode,
    _startId?: string,
  ): Promise<{ root: BaseEntity; shutdown: () => Promise<void> }> {
    const root = this.instantiateTree(Cls, node);
    this.wireRefs(root, node); // Second pass — all instances exist now
    this.registerTree(root, node);

    // Boot thinking loops for all LLMEntity instances
    const observerEmit = this.bridge
      ? (envelope: import('../../events/types.js').EventEnvelope) => this.bridge!.event(envelope)
      : undefined;
    for (const instance of this.factory.getAll().values()) {
      if (instance instanceof LLMEntity) {
        instance.__bootThinkingLoop(observerEmit);
      }
    }

    const wrappers = this.allWrappers();
    const instances = this.factory.getAll();
    for (const w of wrappers) await w.init(this.tree, instances);

    // Start listening for observer control plane requests over pubsub
    if (this.bridge) {
      await this.bridge.listen(
        this.tree,
        StateWrapper.instance(),
        MethodWrapper.instance(),
      );
    }

    return {
      root,
      shutdown: async () => {
        for (const w of wrappers) await w.shutdown();
        await BaseWrapper.destroyAll();
      },
    };
  }

  /** Find a node in the tree by its pre-calculated path ID. */
  private findNodeByPath(node: EntityNode, pathId: string): EntityNode | undefined {
    if (node.id === pathId) return node;
    for (const comp of node.components) {
      if (!comp.entity) continue;
      const found = this.findNodeByPath(comp.entity, pathId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Shallow copy of a node with components at endIds pruned.
   * Pruned components become stubs (entity: undefined) — not instantiated
   * locally, the wrapper routes calls via pubsub instead.
   */
  private pruneTree(node: EntityNode, endIds: Set<string>): EntityNode {
    return {
      ...node,
      components: node.components.map(comp => {
        if (endIds.has(comp.id)) {
          return { ...comp, entity: undefined };
        }
        if (comp.entity) {
          return { ...comp, entity: this.pruneTree(comp.entity, endIds) };
        }
        return comp;
      }),
    };
  }

  private allWrappers(): BaseWrapper[] {
    return [
      StateWrapper.instance(),
      ComponentWrapper.instance(),
      RefWrapper.instance(),
      StreamWrapper.instance(),
      MethodWrapper.instance(),
      HookWrapper.instance(),
    ];
  }

  /** Instantiate entity tree — only local entities (pruned components left as undefined). */
  private instantiateTree(Cls: EntityConstructor, node: EntityNode): BaseEntity {
    const instance = this.factory.getInstance(node.id, Cls);

    for (const comp of node.components) {
      if (comp.entity) {
        const ChildCls = Reflect.getMetadata('design:type', Cls.prototype, comp.propertyName) as EntityConstructor;
        if (ChildCls) {
          (instance as any)[comp.propertyName] = this.instantiateTree(ChildCls, comp.entity);
        }
      }
      // Pruned components stay undefined — ComponentWrapper.onDetachedLeaf creates the proxy
    }

    // Refs + Streams wired after full tree instantiation
    return instance;
  }

  /**
   * Second pass: wire refs after all instances exist.
   * Refs resolve to sibling component instances via InstanceFactory.
   * Don't use design:type — Remote<T> erases it to Object.
   */
  private wireRefs(instance: BaseEntity, node: EntityNode): void {
    for (const ref of node.refs) {
      const resolved = this.factory.get(ref.id);
      if (resolved) {
        (instance as any)[ref.propertyName] = resolved;
      }
    }

    for (const comp of node.components) {
      if (comp.entity) {
        const child = (instance as any)[comp.propertyName] as BaseEntity | undefined;
        if (child) this.wireRefs(child, comp.entity);
      }
    }
  }

  /** Register all elements with their respective wrappers. */
  private registerTree(instance: BaseEntity, node: EntityNode): void {
    const Cls = instance.constructor as EntityConstructor;

    const reg = (id: string, kind: ElementDescriptor['kind'], name: string, metadata?: unknown) => {
      KIND_TO_WRAPPER[kind]().register(id, { entity: instance, entityType: node.type, name, kind, metadata });
    };

    const stateMeta = getStateMeta(Cls);
    for (const s of node.state) reg(s.id, 'state', s.name, stateMeta.get(s.name));

    for (const comp of node.components) {
      reg(comp.id, 'component', comp.propertyName, { entityType: comp.entityType });
      if (comp.entity) {
        const childInstance = (instance as any)[comp.propertyName] as BaseEntity;
        if (childInstance) this.registerTree(childInstance, comp.entity);
      }
    }

    for (const ref of node.refs) reg(ref.id, 'ref', ref.propertyName, { targetEntityType: ref.targetEntityType });
    for (const stream of node.streams) reg(stream.id, 'stream', stream.propertyName);
    for (const method of node.methods) reg(method.id, 'method', method.methodName);

    const hookMeta = getHookMeta(Cls);
    for (const hook of node.hooks) {
      const entry = hookMeta.find(h => h.method === hook.methodName);
      reg(hook.id, 'hook', hook.methodName, entry ? { runnerClass: entry.runnerClass, config: entry.config, initConfig: entry.initConfig, inProcess: entry.inProcess } : undefined);
    }
  }
}
