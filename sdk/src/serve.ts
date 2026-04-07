/**
 * app.serve() — auto-expose entity tools as HTTP endpoints + WebSocket streams.
 *
 * HTTP:
 *   POST /:entityPath/:method  → app.call(entityPath, method, req.body)
 *   GET  /:entityPath/:method  → app.call(entityPath, method) (no input)
 *
 * Multi-tenant:
 *   tenantFrom extracts tenant ID from request → each tenant gets isolated entity tree
 *   shared: ['EntityName'] → these entities are singletons across all tenants
 *
 * WebSocket:
 *   ws://host:port/streams/:entityPath/:streamName → live stream data
 *
 * Custom routes override auto-generated ones.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { InteractKitApp } from './runtime.js';

// ─── Types ──────────────────────────────────────────────

type RouteHandler = (req: ServeRequest) => any | Promise<any>;

export interface ServeRequest {
  method: string;
  path: string;
  body: any;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string>;
  /** Tenant ID (set when tenantFrom is configured) */
  tenantId?: string;
}

export interface HttpConfig {
  port?: number;
  host?: string;
  cors?: boolean;
  expose?: string[];
  exclude?: string[];
  routes?: Record<string, string | RouteHandler>;
  /** Extract tenant ID from request — enables per-tenant isolation */
  tenantFrom?: (req: ServeRequest) => string | undefined | Promise<string | undefined>;
  /** Entity names that are shared across all tenants (not cloned per tenant) */
  shared?: string[];
  /** Max concurrent tenant instances (LRU eviction when exceeded) */
  maxTenants?: number;
  /** Evict idle tenants after this many ms (default: 5 minutes) */
  tenantIdleMs?: number;
}

export interface WsConfig {
  port?: number;
}

export interface ServeConfig {
  http?: HttpConfig | number;
  ws?: WsConfig | number;
}

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

// ─── Tenant Pool ────────────────────────────────────────

class TenantPool {
  private tenants = new Map<string, { app: InteractKitApp; lastAccess: number }>();
  private evictTimer?: ReturnType<typeof setInterval>;

  constructor(
    private parentApp: InteractKitApp,
    private maxTenants: number,
    private idleMs: number,
    private sharedEntities: string[],
  ) {
    // Periodic eviction check
    if (idleMs > 0) {
      this.evictTimer = setInterval(() => this.evictIdle(), Math.min(idleMs, 30_000));
    }
  }

  async get(tenantId: string): Promise<InteractKitApp> {
    const existing = this.tenants.get(tenantId);
    if (existing) {
      existing.lastAccess = Date.now();
      return existing.app;
    }

    // Evict LRU if at capacity
    if (this.maxTenants > 0 && this.tenants.size >= this.maxTenants) {
      await this.evictOldest();
    }

    // Create new tenant instance
    const tenantApp = await this.parentApp.instance(tenantId);
    this.tenants.set(tenantId, { app: tenantApp, lastAccess: Date.now() });
    console.log(`[interactkit] Tenant "${tenantId}" created (${this.tenants.size} active)`);
    return tenantApp;
  }

  private async evictIdle(): Promise<void> {
    const now = Date.now();
    for (const [id, entry] of this.tenants) {
      if (now - entry.lastAccess > this.idleMs) {
        await entry.app.stop();
        this.tenants.delete(id);
        console.log(`[interactkit] Tenant "${id}" evicted (idle)`);
      }
    }
  }

  private async evictOldest(): Promise<void> {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [id, entry] of this.tenants) {
      if (entry.lastAccess < oldestTime) {
        oldest = id;
        oldestTime = entry.lastAccess;
      }
    }
    if (oldest) {
      await this.tenants.get(oldest)!.app.stop();
      this.tenants.delete(oldest);
      console.log(`[interactkit] Tenant "${oldest}" evicted (capacity)`);
    }
  }

  async stopAll(): Promise<void> {
    if (this.evictTimer) clearInterval(this.evictTimer);
    for (const [id, entry] of this.tenants) {
      await entry.app.stop();
    }
    this.tenants.clear();
  }

  get size(): number { return this.tenants.size; }
}

// ─── Serve ──────────────────────────────────────────────

export async function serve(app: InteractKitApp, config: ServeConfig): Promise<{ close(): Promise<void> }> {
  const runtime = app._runtime as any;
  const tree = runtime.tree;

  const httpConf = typeof config.http === 'number' ? { port: config.http } : config.http;
  const wsConf = typeof config.ws === 'number' ? { port: config.ws } : config.ws;

  const httpPort = httpConf?.port ?? 3000;
  const httpHost = httpConf?.host ?? '0.0.0.0';
  const cors = httpConf?.cors ?? true;
  const tenantFrom = httpConf?.tenantFrom;
  const sharedEntities = httpConf?.shared ?? [];
  const maxTenants = httpConf?.maxTenants ?? 10_000;
  const tenantIdleMs = httpConf?.tenantIdleMs ?? 300_000; // 5 minutes

  // Tenant pool (only created if tenantFrom is set)
  const pool = tenantFrom ? new TenantPool(app, maxTenants, tenantIdleMs, sharedEntities) : null;

  /** Resolve the right app for a request */
  async function resolveApp(sreq: ServeRequest): Promise<InteractKitApp> {
    if (!pool || !tenantFrom) return app;
    const tenantId = await tenantFrom(sreq);
    if (!tenantId) return app; // no tenant = use parent app
    sreq.tenantId = tenantId;
    return pool.get(tenantId);
  }

  // Collect all tool routes from entity tree (used for route matching)
  const autoRoutes = collectToolRoutes(tree, app, httpConf?.expose, httpConf?.exclude);

  // Parse custom routes
  const customRoutes = parseCustomRoutes(httpConf?.routes ?? {}, app);

  // Custom routes override auto routes (matched by path)
  const customPaths = new Set(customRoutes.map(r => `${r.method} ${r.path}`));
  const allRoutes = [
    ...customRoutes,
    ...autoRoutes.filter(r => !customPaths.has(`${r.method} ${r.path}`)),
  ];

  // Build route lookup
  const routeMap = new Map<string, Route>();
  for (const route of allRoutes) {
    routeMap.set(`${route.method} ${route.path}`, route);
  }

  // ─── HTTP Server ────────────────────────────────────

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS
    if (cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });

    // Build ServeRequest early (needed for tenantFrom)
    const body = method === 'POST' || method === 'PUT' || method === 'PATCH'
      ? await parseBody(req)
      : undefined;

    const sreq: ServeRequest = {
      method, path, body,
      headers: req.headers as Record<string, string | string[] | undefined>,
      query,
    };

    // Built-in /schema endpoint
    if (path === '/schema' && method === 'GET') {
      const schema = buildSchema(tree);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(schema));
      return;
    }

    // Built-in /_rpc endpoint
    if (path === '/_rpc' && method === 'POST') {
      try {
        if (!body?.entity || !body?.method) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing entity or method in request body' }));
          return;
        }
        const targetApp = await resolveApp(sreq);
        // For tenant apps, prefix entity path with tenant ID
        const entityPath = sreq.tenantId ? `${sreq.tenantId}:${body.entity}` : body.entity;
        const result = await targetApp.call(entityPath, body.method, body.input);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: result ?? null }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message ?? 'RPC error' }));
      }
      return;
    }

    // Try exact match
    const route = routeMap.get(`${method} ${path}`) ?? routeMap.get(`* ${path}`);
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      // For auto-routes with tenants, we need to resolve the app and re-bind the handler
      const targetApp = await resolveApp(sreq);

      // If tenant mode and this is an auto-route, call through the tenant app
      if (pool && targetApp !== app) {
        // Re-route through tenant app instead of parent app
        const result = await executeRoute(route, sreq, targetApp);
        sendResult(res, result);
      } else {
        const result = await route.handler(sreq);
        sendResult(res, result);
      }
    } catch (err: any) {
      const status = err.statusCode ?? 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message ?? 'Internal error' }));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(httpPort, httpHost, () => {
      console.log(`[interactkit] HTTP server on http://${httpHost}:${httpPort}`);
      if (pool) console.log(`[interactkit] Multi-tenant enabled (max: ${maxTenants}, idle: ${tenantIdleMs}ms)`);
      logRoutes(allRoutes);
      resolve();
    });
  });

  // ─── WebSocket Server ───────────────────────────────

  let wss: any = null;
  if (wsConf) {
    const wsPort = wsConf.port ?? httpPort + 1;
    try {
      // @ts-ignore — optional dependency
      const { WebSocketServer } = await import('ws');
      wss = new WebSocketServer({ port: wsPort });

      wss.on('connection', async (ws: any, req: IncomingMessage) => {
        const url = new URL(req.url ?? '/', `http://localhost`);
        const parts = url.pathname.split('/').filter(Boolean);

        // Resolve tenant for WS connections (tenant ID as first path segment if pool exists)
        let targetApp = app;
        if (pool && parts.length > 0) {
          // Try: /tenantId/streams/entityPath/streamName
          const maybeTenant = parts[0];
          try {
            targetApp = await pool.get(maybeTenant);
            parts.shift(); // consume tenant segment
          } catch {
            // not a tenant ID, use parent app
          }
        }

        // /streams/:entityPath/:streamName
        if (parts[0] === 'streams' && parts.length >= 3) {
          const streamName = parts.pop()!;
          const entityPath = parts.slice(1).join('.');

          targetApp.onStream(entityPath, streamName, (data: any) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ stream: streamName, data }));
            }
          });

          ws.send(JSON.stringify({ connected: true, stream: `${entityPath}.${streamName}` }));
        }

        // /call/:entityPath/:method — tool call over WS
        if (parts[0] === 'call' && parts.length >= 3) {
          const methodName = parts.pop()!;
          const entityPath = parts.slice(1).join('.');

          ws.on('message', async (msg: any) => {
            try {
              const input = JSON.parse(msg.toString());
              const result = await targetApp.call(entityPath, `${entityPath.split('.').pop()}.${methodName}`, input);
              ws.send(JSON.stringify({ result }));
            } catch (err: any) {
              ws.send(JSON.stringify({ error: err.message }));
            }
          });
        }
      });

      console.log(`[interactkit] WebSocket server on ws://${httpHost}:${wsPort}`);
    } catch {
      console.warn('[interactkit] ws package not installed — WebSocket disabled. Install with: npm i ws');
    }
  }

  return {
    async close() {
      if (pool) await pool.stopAll();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
      });
      if (wss) {
        await new Promise<void>((resolve) => {
          wss.close(() => resolve());
        });
      }
    },
  };
}

// ─── Route execution for tenant-scoped requests ─────────

function executeRoute(route: Route, sreq: ServeRequest, tenantApp: InteractKitApp): Promise<any> {
  // For auto-generated routes, re-execute through the tenant app
  // The route.handler closure captured the parent app — we need to call through tenantApp instead
  const pathParts = sreq.path.split('/').filter(Boolean);
  if (pathParts.length >= 2) {
    const methodName = pathParts.pop()!;
    const entityPath = pathParts.join('.');
    const entityType = entityPath.split('.').pop()!;
    const eventName = `${entityType}.${methodName}`;
    // Prefix entity path with tenant ID
    const tenantPath = sreq.tenantId ? `${sreq.tenantId}:${entityPath}` : entityPath;
    return tenantApp.call(tenantPath, eventName, sreq.body);
  }
  return route.handler(sreq);
}

function sendResult(res: ServerResponse, result: any): void {
  if (result === undefined || result === null) {
    res.writeHead(204);
    res.end();
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }
}

// ─── Route collection ───────────────────────────────────

function collectToolRoutes(
  node: any,
  app: InteractKitApp,
  expose?: string[],
  exclude?: string[],
  parentPath = '',
): Route[] {
  const routes: Route[] = [];
  const entityPath = parentPath || node.id;

  for (const method of (node.methods ?? [])) {
    const toolId = `${entityPath}.${method.methodName}`;
    const routePath = `/${entityPath.replace(/\./g, '/')}/${method.methodName}`;

    // Filter
    if (expose && !matchesFilter(toolId, expose)) continue;
    if (exclude && matchesFilter(toolId, exclude)) continue;

    const hasInput = method.inputSchema?.fields?.length > 0;

    routes.push({
      method: hasInput ? 'POST' : 'GET',
      path: routePath,
      handler: async (req) => {
        return app.call(entityPath, method.eventName, hasInput ? req.body : undefined);
      },
    });
  }

  // LLM entities get POST /:path/invoke
  if (node.executor) {
    const routePath = `/${entityPath.replace(/\./g, '/')}/invoke`;
    routes.push({
      method: 'POST',
      path: routePath,
      handler: async (req) => {
        return app.call(entityPath, 'invoke', req.body);
      },
    });
  }

  // Recurse into components
  for (const comp of (node.components ?? [])) {
    if (comp.entity) {
      routes.push(...collectToolRoutes(comp.entity, app, expose, exclude, comp.id));
    }
  }

  return routes;
}

function matchesFilter(toolId: string, patterns: string[]): boolean {
  return patterns.some(p => {
    if (p.endsWith('.*')) {
      return toolId.startsWith(p.slice(0, -1));
    }
    return toolId === p;
  });
}

function parseCustomRoutes(routes: Record<string, string | RouteHandler>, app: InteractKitApp): Route[] {
  const result: Route[] = [];

  for (const [key, value] of Object.entries(routes)) {
    const parts = key.split(' ');
    const method = parts.length > 1 ? parts[0] : '*';
    const path = parts.length > 1 ? parts[1] : parts[0];

    if (typeof value === 'string') {
      // Alias: 'POST /research' → 'pipeline.process'
      const [entityPath, methodName] = value.split('.');
      result.push({
        method,
        path,
        handler: async (req) => {
          const eventName = `${entityPath}.${methodName}`;
          return app.call(entityPath, eventName, req.body);
        },
      });
    } else {
      // Custom handler function
      result.push({ method, path, handler: value });
    }
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) { resolve(undefined); return; }
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/** Build a schema object from the entity tree for /schema endpoint */
function buildSchema(node: any, parentPath = ''): any {
  const entityPath = parentPath || node.id;
  const methods: any[] = [];

  for (const m of (node.methods ?? [])) {
    methods.push({
      name: m.methodName,
      event: m.eventName,
      description: m.description,
      input: m.inputSchema ?? null,
      ...(m.auto ? { auto: m.auto, on: m.on } : {}),
    });
  }

  const streams = (node.streams ?? []).map((s: any) => ({
    name: s.propertyName,
  }));

  const components: any[] = [];
  for (const comp of (node.components ?? [])) {
    if (comp.entity) {
      components.push({
        name: comp.propertyName,
        type: comp.entityType,
        schema: buildSchema(comp.entity, comp.id),
      });
    }
  }

  return {
    id: entityPath,
    type: node.type,
    name: node.className,
    describe: node.describe,
    methods,
    streams,
    components,
    executor: node.executor ?? null,
  };
}

function logRoutes(routes: Route[]): void {
  const grouped = new Map<string, string[]>();
  for (const r of routes) {
    const key = r.method;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r.path);
  }
  for (const [method, paths] of grouped) {
    for (const path of paths) {
      console.log(`  ${method.padEnd(5)} ${path}`);
    }
  }
}
