/**
 * InteractKitRuntime — core runtime for the v4 entity graph.
 *
 * Manages entity lifecycle, handler registration, event routing,
 * and provides the typed proxy system for external access.
 */

import { randomUUID } from 'node:crypto';
import { Entity } from './entity.js';
import { createReactiveState, flushReactiveState } from './reactive.js';
import { createExecutor, createInvokeHandler } from './llm/llm.js';
import { EventBus } from './events/bus.js';
import { InProcessBusAdapter } from './pubsub/in-process.js';
import type { DatabaseAdapter } from './database/adapter.js';
import type { ObserverAdapter } from './observer/adapter.js';
import type { VectorStoreAdapter } from './vectorstore.js';
import { createMemoryHandlers } from './vectorstore.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

// Reuse the tree types from the existing SDK
export interface EntityNode {
  id: string;
  type: string;
  className: string;
  describe?: string;
  infra: { remote?: string };
  state: Array<{ name: string; id: string }>;
  refs: Array<{ propertyName: string; targetEntityType: string; id: string }>;
  components: Array<{ id: string; propertyName: string; entityType: string; entity?: EntityNode }>;
  streams: Array<{ propertyName: string; id: string }>;
  methods: Array<{ methodName: string; eventName: string; id: string; description?: string }>;
  hooks: Array<{ methodName: string; hookTypeName: string; runnerExport?: string; inProcess: boolean; id: string }>;
}

export type HandlerFn = (entity: Entity, input?: any) => any;
export type ListenerFn = (input: any, result: any) => void;

export type HandlerMap = Record<string, Record<string, HandlerFn>>;

export interface RuntimeConfig {
  database: DatabaseAdapter;
  observers?: ObserverAdapter[];
  timeout?: number;
  stateFlushMs?: number;
  /** Handlers keyed by entity type (e.g. 'Phone') or entity path (e.g. 'john.phone') */
  handlers?: HandlerMap;
  /** Vector store adapter for long-term-memory entities */
  vectorStore?: VectorStoreAdapter;
}

export class InteractKitRuntime {
  protected entities = new Map<string, Entity>();
  /** Handlers by entity type (shared across instances of same type) */
  private handlers = new Map<string, Map<string, HandlerFn>>();
  /** Handlers by entity path (instance-specific overrides) */
  private pathHandlers = new Map<string, Map<string, HandlerFn>>();
  private listeners = new Map<string, Map<string, ListenerFn[]>>();
  private executors = new Map<string, BaseChatModel>();
  private streamListeners = new Map<string, Array<(data: any) => void>>();
  private localBus!: EventBus;
  private observer?: ObserverAdapter;
  private config?: RuntimeConfig;
  private tree: EntityNode;
  private registry: any;
  private booted = false;
  /** Which entity paths this process owns. null = owns all. */

  constructor(tree: EntityNode, registry: any) {
    this.tree = tree;
    this.registry = registry;
  }

  /**
   * Configure infrastructure adapters.
   * Returns an InteractKitApp — the configured, handler-registrable, bootable instance.
   */
  configure(config: RuntimeConfig): InteractKitApp {
    this.config = config;

    // Process handlers from config
    if (config.handlers) {
      for (const [key, methods] of Object.entries(config.handlers)) {
        if (!methods) continue;
        const isPath = key.includes('.');
        // Normalize PascalCase entity names to kebab-case to match tree node types
        const normalizedKey = isPath ? key : toKebab(key);
        const map = isPath ? this.pathHandlers : this.handlers;
        if (!map.has(normalizedKey)) map.set(normalizedKey, new Map());
        for (const [method, fn] of Object.entries(methods)) {
          map.get(normalizedKey)!.set(method, fn as HandlerFn);
        }
      }
    }

    return new InteractKitApp(this);
  }

  /**
   * Register a handler for an entity's tool method.
   */
  /**
   * Register a handler by entity type (shared) or entity path (instance override).
   * Paths contain dots (e.g. 'john.phone'), types don't (e.g. 'Phone').
   */
  addHandler(entity: string, method: string, fn: HandlerFn): this;
  addHandler(...args: any[]): this {
    const [key, method, fn] = args;
    const isPath = key.includes('.');
    const map = isPath ? this.pathHandlers : this.handlers;
    if (!map.has(key)) map.set(key, new Map());
    map.get(key)!.set(method, fn);
    return this;
  }

  /**
   * Fluent handler builder for an entity type.
   * Returns a proxy where each method name registers a handler.
   * Usage: graph.EntityName.methodName(fn) — chainable.
   */
  /** @internal */
  handleBuilder(entityType: string): any {
    const runtime = this;
    return new Proxy({}, {
      get(_target, method: string) {
        return (fn: HandlerFn) => {
          runtime.addHandler(entityType, method, fn);
          return runtime.handleBuilder(entityType);
        };
      },
    });
  }

  /**
   * Subscribe to events on an entity method.
   */
  on(entity: string, method: string, fn: ListenerFn): this;
  on(...args: any[]): this {
    const [entityType, method, fn] = args;
    if (!this.listeners.has(entityType)) {
      this.listeners.set(entityType, new Map());
    }
    const methodListeners = this.listeners.get(entityType)!;
    if (!methodListeners.has(method)) {
      methodListeners.set(method, []);
    }
    methodListeners.get(method)!.push(fn);
    return this;
  }

  /**
   * Subscribe to a stream on an entity.
   * entityPath is the entity's path ID (e.g. "agent.mouth").
   * streamName is the stream property name (e.g. "transcript").
   */
  onStream(entityPath: string, streamName: string, fn: (data: any) => void): this {
    const key = `${entityPath}:${streamName}`;
    if (!this.streamListeners.has(key)) {
      this.streamListeners.set(key, []);
    }
    this.streamListeners.get(key)!.push(fn);
    return this;
  }

  /**
   * Call an entity method through the event bus (or HTTP for remote entities).
   */
  async call(entityPath: string, method: string, input?: any): Promise<any> {
    if (!this.booted) throw new Error('Runtime not booted — call boot() first');

    // Check if target is a remote entity (or its parent is remote)
    const remoteNode = this.findRemoteAncestor(entityPath);
    if (remoteNode) {
      // Remap the local path to the remote service's path
      // e.g. local "gateway.worker" → remote "worker"
      const remoteRoot = remoteNode.type; // the remote entity's root type/id
      const localPrefix = remoteNode.id; // e.g. "gateway.worker"
      const remotePath = entityPath === localPrefix
        ? remoteRoot
        : remoteRoot + entityPath.slice(localPrefix.length);
      return this.callRemote(remoteNode.infra.remote!, remotePath, method, input);
    }

    return this.localBus.request({
      id: randomUUID(),
      source: '__runtime',
      target: entityPath,
      type: method,
      payload: input,
      timestamp: Date.now(),
    });
  }

  /**
   * Boot the entity graph.
   */
  async boot(options?: { strict?: boolean }): Promise<void> {
    if (this.booted) throw new Error('Runtime already booted');
    if (!this.config) throw new Error('Runtime not configured — call configure() first');

    const { database, observers, timeout, stateFlushMs = 50 } = this.config;

    // Set up composite observer
    if (observers && observers.length > 0) {
      this.observer = observers.length === 1
        ? observers[0]
        : createCompositeObserver(observers);
      this.wireObserver(this.observer);
    }

    // Set up event buses
    const localAdapter = new InProcessBusAdapter();
    this.localBus = new EventBus(localAdapter, this.observer, timeout);

    // 1. Create entity instances
    this.createEntities(this.tree, database, stateFlushMs, this.observer);

    // 2. Hydrate state from database
    await this.hydrateState(database);

    // 3. Load secrets from environment
    this.loadSecrets(this.tree);

    // 4. Wire refs and components as proxies
    this.wireRefs(this.tree);
    this.wireComponents(this.tree);

    // 5. Initialize LLM executors and register invoke handlers
    await this.initializeLLMEntities(this.tree);

    // 5b. Auto-register handlers for long-term-memory entities
    if (this.config.vectorStore) {
      this.registerMemoryHandlers(this.tree, this.config.vectorStore);
    }

    // 6. Set up event bus listeners
    this.setupEventListeners(this.tree);

    // Mark as booted before init handlers so they can call other entities
    this.booted = true;

    // 7. Call init handlers (bottom-up: children first)
    await this.callInitHandlers(this.tree);

    // 8. Set entity tree on observers
    if (this.observer && 'setTree' in this.observer) {
      (this.observer as any).setTree(this.tree);
    }

    // Validate handlers if strict mode
    if (options?.strict) {
      this.validateHandlers(this.tree);
    }
  }

  /**
   * Stop the runtime — flush state, cleanup.
   */
  async stop(): Promise<void> {
    if (!this.booted) return;

    // Flush all entity state
    for (const entity of this.entities.values()) {
      await flushReactiveState(entity.state, entity.id, entity._db);
    }

    await this.localBus.destroy();
    this.booted = false;
  }

  /**
   * Create a typed proxy for external access.
   * Used by generated graph class for typed getters.
   */
  protected proxy(path: string): any {
    return this.createProxy(path, this.tree);
  }

  // ─── Internal: Entity creation ────────────────────────

  /** Walk up from a path and find the nearest node with remote set */
  private findRemoteAncestor(path: string): EntityNode | null {
    // Check the node itself first
    const node = this.findNode(path, this.tree);
    if (node?.infra?.remote) return node;

    // Check parent paths (e.g. "gateway.worker.child" → check "gateway.worker" → "gateway")
    const parts = path.split('.');
    for (let i = parts.length - 1; i >= 1; i--) {
      const parentPath = parts.slice(0, i).join('.');
      const parent = this.findNode(parentPath, this.tree);
      if (parent?.infra?.remote) return parent;
    }
    return null;
  }

  private getBus(_node: EntityNode): EventBus {
    return this.localBus;
  }

  private async callRemote(baseUrl: string, entityPath: string, method: string, input?: any): Promise<any> {
    const url = `${baseUrl.replace(/\/$/, '')}/_rpc`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity: entityPath, method, input }),
    });

    if (!res.ok) {
      const body = await res.text();
      let msg: string;
      try { msg = JSON.parse(body).error; } catch { msg = body; }
      throw new Error(`Remote call failed (${res.status}): ${msg}`);
    }

    if (res.status === 204) return undefined;
    const { result } = await res.json() as any;
    return result;
  }

  private createEntities(node: EntityNode, db: DatabaseAdapter, flushMs: number, observer?: ObserverAdapter): void {
    // Skip remote entities — they live on another service
    if (node.infra?.remote) return;

    // Initialize state from tree defaults
    const initialState: Record<string, any> = {};
    for (const field of node.state) {
      const def = (field as any).default;
      if (def !== undefined) {
        initialState[field.name] = Array.isArray(def) ? [...def] : def;
      } else {
        initialState[field.name] = undefined;
      }
    }

    // Use the appropriate bus for this entity
    const bus = this.getBus(node);
    const entity = new Entity(node.id, node.type, initialState, bus, db);

    // Wrap state in reactive proxy
    entity.state = createReactiveState(entity.state, {
      entityId: node.id,
      db,
      flushMs,
      observer,
    });

    // Create stream emitters
    for (const stream of node.streams) {
      const streamKey = `${node.id}:${stream.propertyName}`;
      entity.streams[stream.propertyName] = {
        emit: (data: any) => {
          const listeners = this.streamListeners.get(streamKey);
          if (listeners) {
            for (const fn of listeners) {
              try { fn(data); } catch { /* stream listener errors don't propagate */ }
            }
          }
        },
      };
    }

    this.entities.set(node.id, entity);

    // Recurse into components
    for (const comp of node.components) {
      if (comp.entity) {
        this.createEntities(comp.entity, db, flushMs, observer);
      }
    }
  }

  // ─── Internal: State hydration ────────────────────────

  private async hydrateState(db: DatabaseAdapter): Promise<void> {
    for (const [id, entity] of this.entities) {
      const stored = await db.get(id);
      if (stored) {
        for (const [key, value] of Object.entries(stored)) {
          entity.state[key] = value;
        }
      }
    }
  }

  // ─── Internal: LLM initialization ─────────────────────

  private async initializeLLMEntities(node: EntityNode): Promise<void> {
    // Recurse into children first
    for (const comp of node.components) {
      if (comp.entity) await this.initializeLLMEntities(comp.entity);
    }

    // Skip non-LLM entities
    const regEntity = this.registry?.entities?.[node.type];
    // Check the tree — LLM entities have an executor config stored in registry
    // For now, we detect LLM entities by checking if the entity type has llm config
    // The tree node doesn't store executor config directly, so we check the registry
    if (!regEntity) return;

    // Look for executor config in the entity tree (added by codegen)
    const executorConfig = (node as any).executor;
    if (!executorConfig) return;

    try {
      const executor = await createExecutor(executorConfig);
      this.executors.set(node.id, executor);

      // Register built-in invoke handler
      const invokeHandler = createInvokeHandler(
        node,
        this.tree,
        executor,
        this.handlers,
        (target, method, input) => this.call(target, method, input),
      );

      // Register invoke on this entity type
      if (!this.handlers.has(node.type)) {
        this.handlers.set(node.type, new Map());
      }
      // Only set invoke if no user handler already registered
      if (!this.handlers.get(node.type)!.has('invoke')) {
        this.handlers.get(node.type)!.set('invoke', invokeHandler);
      }
    } catch (err: any) {
      console.warn(`[interactkit] Failed to create executor for ${node.id}: ${err.message}`);
    }
  }

  // ─── Internal: Long-term memory ───────────────────────

  private registerMemoryHandlers(node: EntityNode, vectorStore: VectorStoreAdapter): void {
    for (const comp of node.components) {
      if (comp.entity) this.registerMemoryHandlers(comp.entity, vectorStore);
    }

    // Check if this is a long-term-memory entity (type ends with long-term-memory)
    if (!node.type.includes('long-term-memory')) return;

    const handlers = createMemoryHandlers(vectorStore);
    if (!this.handlers.has(node.type)) {
      this.handlers.set(node.type, new Map());
    }
    const typeHandlers = this.handlers.get(node.type)!;

    // Only set if no user handler already registered
    if (!typeHandlers.has('memorize')) typeHandlers.set('memorize', handlers.memorize);
    if (!typeHandlers.has('recall')) typeHandlers.set('recall', handlers.recall);
    if (!typeHandlers.has('forget')) typeHandlers.set('forget', handlers.forget);
  }

  // ─── Internal: Secrets ────────────────────────────────

  private loadSecrets(node: EntityNode): void {
    // Secrets are in the IR but not in EntityNode currently.
    // The generated tree would need to include secrets.
    // For now, skip — will be populated when tree format is extended.

    for (const comp of node.components) {
      if (comp.entity) this.loadSecrets(comp.entity);
    }
  }

  // ─── Internal: Wire refs/components ───────────────────

  private wireRefs(node: EntityNode): void {
    const entity = this.entities.get(node.id);
    if (!entity) return;

    for (const ref of node.refs) {
      // Find the ref target entity by walking the parent's components
      const parentId = node.id.includes('.') ? node.id.substring(0, node.id.lastIndexOf('.')) : undefined;
      if (parentId) {
        // Ref target should be a sibling — find it
        const targetId = `${parentId}.${ref.propertyName}`;
        entity.refs[ref.propertyName] = this.createProxy(targetId, this.findNode(targetId, this.tree));
      }
    }

    for (const comp of node.components) {
      if (comp.entity) this.wireRefs(comp.entity);
    }
  }

  private wireComponents(node: EntityNode): void {
    const entity = this.entities.get(node.id);
    if (!entity) return;

    for (const comp of node.components) {
      entity.components[comp.propertyName] = this.createProxy(comp.id, comp.entity);
    }

    for (const comp of node.components) {
      if (comp.entity) this.wireComponents(comp.entity);
    }
  }

  // ─── Internal: Event bus ──────────────────────────────

  private setupEventListeners(node: EntityNode): void {
    // Skip remote entities — calls go via HTTP proxy
    if (node.infra?.remote) return;

    const bus = this.getBus(node);
    bus.listen(node.id, async (envelope) => {
      const entity = this.entities.get(node.id);
      if (!entity) throw new Error(`Entity "${node.id}" not found`);

      const eventName = envelope.type;
      // Extract method name: "entity-type.methodName" → "methodName"
      const method = eventName.includes('.') ? eventName.split('.').pop()! : eventName;

      // Check describe
      if (method === 'describe') {
        const handler = this.pathHandlers.get(node.id)?.get('describe')
          ?? this.handlers.get(node.type)?.get('describe');
        if (handler) return handler(entity);
        if (node.describe) return this.interpolateDescribe(node.describe, entity.state);
        return node.type;
      }

      // Find handler — path override first, then type, then auto, then LLM auto-invoke
      let handler = this.pathHandlers.get(node.id)?.get(method)
        ?? this.handlers.get(node.type)?.get(method);

      if (!handler) {
        // Check if this is an auto tool — generate default CRUD handler
        const methodNode = node.methods.find(m => m.methodName === method || m.eventName === eventName);
        if (methodNode && (methodNode as any).auto) {
          handler = this.createAutoHandler(methodNode);
        }
      }

      if (!handler) {
        // LLM entities: auto-invoke for tools without handlers
        const hasExecutor = this.executors.has(node.id);
        if (hasExecutor) {
          const methodNode = node.methods.find(m => m.methodName === method || m.eventName === eventName);
          if (methodNode) {
            handler = async (e: Entity, input?: any) => {
              const inputStr = input ? JSON.stringify(input) : '';
              return this.call(node.id, 'invoke', {
                message: `${methodNode.description ?? methodNode.methodName}${inputStr ? `: ${inputStr}` : ''}`,
              });
            };
          }
        }
      }

      if (!handler) {
        throw new Error(`No handler registered for ${node.type}.${method}`);
      }

      const result = await handler(entity, envelope.payload);

      // Notify listeners
      const methodListeners = this.listeners.get(node.type)?.get(method);
      if (methodListeners) {
        for (const listener of methodListeners) {
          try { listener(envelope.payload, result); } catch { /* listener errors don't propagate */ }
        }
      }

      return result;
    });

    for (const comp of node.components) {
      if (comp.entity) this.setupEventListeners(comp.entity);
    }
  }

  // ─── Internal: Auto handlers ──────────────────────────

  /**
   * Create a CRUD handler for auto tools.
   * The operation and key are explicit in the XML:
   *   auto="create|read|update|delete|list|search|count" key="id"
   */
  private createAutoHandler(methodNode: EntityNode['methods'][0]): HandlerFn {
    const op = (methodNode as any).auto as string;
    const key = (methodNode as any).key as string | undefined;
    const on = (methodNode as any).on as string | undefined;

    return async (entity: Entity, input?: any) => {
      // Use fieldGroup name if specified, otherwise fall back to first array
      const fieldName = on ?? Object.keys(entity.state).find(k => Array.isArray(entity.state[k]));
      if (!fieldName || !Array.isArray(entity.state[fieldName])) {
        throw new Error(`Auto handler for ${methodNode.methodName}: state field "${fieldName ?? '?'}" not found or not an array`);
      }
      const arr = entity.state[fieldName] as any[];

      switch (op) {
        case 'create': {
          const id = `${fieldName.replace(/s$/, '')}_${Date.now()}`;
          const entry = typeof input === 'object'
            ? { id, ...input, createdAt: Date.now(), updatedAt: Date.now() }
            : input;
          entity.state[fieldName].push(entry);
          return typeof entry === 'object' ? entry.id : undefined;
        }

        case 'read': {
          if (!key) throw new Error(`Auto "read" requires a key attribute`);
          return arr.find(i => i?.[key] === input?.[key]);
        }

        case 'update': {
          if (!key) throw new Error(`Auto "update" requires a key attribute`);
          const item = arr.find(i => i?.[key] === input?.[key]);
          if (!item) throw new Error(`Item with ${key}="${input?.[key]}" not found`);
          for (const [k, v] of Object.entries(input ?? {})) {
            if (k !== key && v !== undefined) item[k] = v;
          }
          item.updatedAt = Date.now();
          return;
        }

        case 'delete': {
          if (!key) throw new Error(`Auto "delete" requires a key attribute`);
          entity.state[fieldName] = arr.filter(i => i?.[key] !== input?.[key]);
          return;
        }

        case 'list': {
          return [...arr];
        }

        case 'search': {
          if (!key) throw new Error(`Auto "search" requires a key attribute (the search input field)`);
          const q = String(input?.[key] ?? '').toLowerCase();
          return arr.filter(item => {
            if (typeof item === 'string') return item.toLowerCase().includes(q);
            return Object.values(item).some(v =>
              typeof v === 'string' && v.toLowerCase().includes(q)
            );
          });
        }

        case 'count': {
          return arr.length;
        }

        default:
          throw new Error(`Unknown auto operation: "${op}"`);
      }
    };
  }

  // ─── Internal: Init ───────────────────────────────────

  private async callInitHandlers(node: EntityNode): Promise<void> {
    // Children first (bottom-up)
    for (const comp of node.components) {
      if (comp.entity) await this.callInitHandlers(comp.entity);
    }

    const handler = this.handlers.get(node.type)?.get('init');
    if (handler) {
      const entity = this.entities.get(node.id);
      if (entity) await handler(entity);
    }
  }

  // ─── Internal: Validation ─────────────────────────────

  private validateHandlers(node: EntityNode): void {
    // LLM entities don't need handlers (thinking loop handles)
    if (node.type !== 'llm') {
      for (const method of node.methods) {
        const handler = this.handlers.get(node.type)?.get(method.methodName);
        if (!handler) {
          throw new Error(`[strict] Missing handler for ${node.type}.${method.methodName}`);
        }
      }
    }

    for (const comp of node.components) {
      if (comp.entity) this.validateHandlers(comp.entity);
    }
  }

  // ─── Internal: Proxy ──────────────────────────────────

  private createProxy(path: string, node?: EntityNode | null): any {
    const runtime = this;

    return new Proxy({}, {
      get(_target, prop: string) {
        if (!node) return undefined;

        // Check if prop is a component
        const comp = node.components.find(c => c.propertyName === prop);
        if (comp?.entity) {
          return runtime.createProxy(comp.id, comp.entity);
        }

        // Check if prop is a method
        const method = node.methods.find(m => m.methodName === prop);
        if (method) {
          return async (input?: any) => {
            return runtime.call(path, method.eventName, input);
          };
        }

        // invoke() for LLM entities
        if (prop === 'invoke') {
          return async (input: any) => {
            return runtime.call(path, 'invoke', input);
          };
        }

        return undefined;
      },
    });
  }

  private findNode(path: string, root: EntityNode): EntityNode | null {
    if (root.id === path) return root;
    for (const comp of root.components) {
      if (comp.entity) {
        const found = this.findNode(path, comp.entity);
        if (found) return found;
      }
    }
    return null;
  }

  // ─── Internal: Observer wiring ─────────────────────────

  /**
   * Wire an observer so it can read state, call methods, and get the tree.
   */
  private wireObserver(obs: ObserverAdapter): void {
    const runtime = this;

    // Override getState to read from entity instances
    obs.getState = async (entityId: string, field: string) => {
      const entity = runtime.entities.get(entityId);
      return entity?.state[field];
    };

    // Override setState to write to entity instances
    obs.setState = (entityId: string, field: string, value: unknown) => {
      const entity = runtime.entities.get(entityId);
      if (entity) entity.state[field] = value;
    };

    // Override callMethod to route through event bus
    obs.callMethod = async (entityId: string, method: string, payload?: unknown) => {
      return runtime.call(entityId, method, payload);
    };

    // Override getEntityTree
    obs.getEntityTree = async () => runtime.tree;
  }

  // ─── Internal: Describe interpolation ─────────────────

  private interpolateDescribe(template: string, state: Record<string, any>): string {
    return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
      const parts = expr.trim().split('.');
      let value: any = state;
      for (const part of parts) {
        if (value == null) return 'undefined';
        value = value[part];
      }
      return String(value ?? 'undefined');
    });
  }
}

/** Deep-clone an entity tree with all IDs prefixed by tenantId */
function namespacedTree(node: EntityNode, tenantId: string): EntityNode {
  const prefix = (id: string) => `${tenantId}:${id}`;
  return {
    ...node,
    id: prefix(node.id),
    state: node.state.map((s: any) => ({ ...s, id: prefix(s.id) })),
    refs: node.refs.map(r => ({ ...r, id: prefix(r.id) })),
    streams: node.streams.map(s => ({ ...s, id: prefix(s.id) })),
    methods: node.methods.map((m: any) => ({ ...m, id: prefix(m.id) })),
    hooks: node.hooks.map((h: any) => ({ ...h, id: prefix(h.id) })),
    components: node.components.map(c => ({
      ...c,
      id: prefix(c.id),
      entity: c.entity ? namespacedTree(c.entity, tenantId) : undefined,
    })),
  };
}

function toKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// ═══════════════════════════════════════════════════════════
// Composite observer — fans out to multiple observers
// ═══════════════════════════════════════════════════════════

function createCompositeObserver(observers: ObserverAdapter[]): ObserverAdapter {
  return {
    event(envelope) { for (const o of observers) o.event(envelope); },
    error(envelope, error) { for (const o of observers) o.error(envelope, error); },
    on(event, handler) { for (const o of observers) o.on(event, handler); },
    off(event, handler) { for (const o of observers) o.off(event, handler); },
    setState(id, field, value) { for (const o of observers) o.setState(id, field, value); },
    async getState(id, field) { return observers[0].getState(id, field); },
    async callMethod(id, method, payload) { return observers[0].callMethod(id, method, payload); },
    async getEntityTree() { return observers[0].getEntityTree(); },
  };
}

// ═══════════════════════════════════════════════════════════
// InteractKitApp — configured instance returned by graph.configure()
// ═══════════════════════════════════════════════════════════

/**
 * The configured, handler-registrable, bootable instance.
 * Returned by graph.configure(). Exposes:
 * - Entity handler builders (app.EntityName.method(fn))
 * - addHandler / on (string-based fallback)
 * - boot() / stop()
 * - Typed proxy accessors (app.entityName.method(input))
 */
export class InteractKitApp {
  /** @internal */
  _runtime: InteractKitRuntime;

  constructor(runtime: InteractKitRuntime) {
    this._runtime = runtime;
  }

  addHandler(entity: string, method: string, fn: HandlerFn): this {
    this._runtime.addHandler(entity, method, fn);
    return this;
  }

  on(entity: string, method: string, fn: ListenerFn): this {
    this._runtime.on(entity, method, fn);
    return this;
  }

  onStream(entityPath: string, streamName: string, fn: (data: any) => void): this {
    this._runtime.onStream(entityPath, streamName, fn);
    return this;
  }

  async call(entityPath: string, method: string, input?: any): Promise<any> {
    return this._runtime.call(entityPath, method, input);
  }

  async boot(options?: { strict?: boolean }): Promise<void> {
    return this._runtime.boot(options);
  }

  async stop(): Promise<void> {
    return this._runtime.stop();
  }

  async serve(config: import('./serve.js').ServeConfig): Promise<{ close(): Promise<void> }> {
    const { serve } = await import('./serve.js');
    return serve(this, config);
  }

  /**
   * Create an isolated tenant instance with its own state.
   * Entity tree structure and handlers are shared, state is namespaced by tenantId.
   *
   * ```ts
   * const alice = await app.instance('alice');
   * const bob = await app.instance('bob');
   * await alice.agent.chat({ message: 'hi' }); // alice's state
   * await bob.agent.chat({ message: 'hi' });   // bob's state (independent)
   * ```
   */
  async instance(tenantId: string): Promise<InteractKitApp> {
    const runtime = this._runtime as any;

    // Create a new runtime with the same tree and registry, but namespaced entity IDs
    const tenantTree = namespacedTree(runtime.tree, tenantId);
    const tenantRuntime = new InteractKitRuntime(tenantTree, runtime.registry);

    // Copy handlers from the parent runtime
    for (const [type, methods] of runtime.handlers) {
      for (const [method, fn] of methods) {
        tenantRuntime.addHandler(type, method, fn);
      }
    }

    // Configure with the same config
    const tenantApp = tenantRuntime.configure(runtime.config);
    await tenantApp.boot();
    return tenantApp;
  }

  /** @internal — used by generated subclass for entity handler builders */
  protected handleBuilder(entityType: string): any {
    return this._runtime.handleBuilder(entityType);
  }

  /** @internal — used by generated subclass for typed proxy getters */
  protected proxy(path: string): any {
    const runtime = this._runtime as any;
    const node = runtime.findNode(path, runtime.tree);
    return runtime.createProxy(path, node);
  }
}
