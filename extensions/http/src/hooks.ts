import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { HookRunner, HookHandler } from '@interactkit/sdk';

// ─── Centralized HTTP Server Pool ──────────────────────────
// Shares a single http.Server per port across all HttpRequest hook runners.
// Multiple hooks on different path prefixes share the same server.
// Longest-prefix matching routes each request to the correct handler.

type RequestHandler = (req: IncomingMessage, res: ServerResponse, url: URL) => void;

interface ManagedHttpServer {
  server: Server;
  handlers: Map<string, RequestHandler>;
}

const httpPool = new Map<number, ManagedHttpServer>();

function acquireHttpServer(port: number, path: string, handler: RequestHandler): void {
  let managed = httpPool.get(port);
  if (!managed) {
    managed = { server: null!, handlers: new Map() };
    const m = managed;
    m.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);
      // Longest-prefix match
      let bestPrefix = '';
      let bestHandler: RequestHandler | undefined;
      for (const [prefix, h] of m.handlers) {
        if (url.pathname.startsWith(prefix) && prefix.length > bestPrefix.length) {
          bestPrefix = prefix;
          bestHandler = h;
        }
      }
      if (bestHandler) {
        bestHandler(req, res, url);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    httpPool.set(port, managed);
    m.server.on('error', (e: Error) => { console.error(`HttpRequest: server error on port ${port}:`, e.message); });
    m.server.listen(port);
  }
  if (managed.handlers.has(path)) {
    throw new Error(`HttpRequest: path "${path}" already registered on port ${port}`);
  }
  managed.handlers.set(path, handler);
}

function releaseHttpServer(port: number, path: string): Promise<void> {
  const managed = httpPool.get(port);
  if (!managed) return Promise.resolve();
  managed.handlers.delete(path);
  if (managed.handlers.size === 0) {
    httpPool.delete(port);
    return new Promise<void>((resolve) => managed.server.close(() => resolve()));
  }
  return Promise.resolve();
}

// ─── HttpRequest Hook ────────────────────────────────────
// Init config (from interactkit.config.ts): { http: { port: 3000 } }
// Run config (from @Hook decorator): { path: '/webhook' }

export namespace HttpRequest {
  export interface Input {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
    query: Record<string, string>;
    respond: (status: number, body: string, headers?: Record<string, string>) => void;
  }

  export interface Config {
    port?: number;
    path?: string;
  }

  class RunnerImpl implements HookRunner<Input> {
    private port = 0;
    private path = '/';

    async init(config: Record<string, unknown>) {
      const http = config.http as Record<string, unknown> | undefined;
      this.port = (http?.port as number) ?? 3000;
    }

    register(emit: (data: Input) => void, config: Record<string, unknown>) {
      if (config.port) this.port = config.port as number;
      this.path = (config.path as string) ?? '/';

      acquireHttpServer(this.port, this.path, async (req, res, url) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = Buffer.concat(chunks).toString();

        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers[k] = v;
        }

        const query: Record<string, string> = {};
        for (const [k, v] of url.searchParams.entries()) query[k] = v;

        let responded = false;
        emit({
          method: req.method ?? 'GET',
          path: url.pathname,
          headers,
          body,
          query,
          respond(status: number, resBody: string, resHeaders?: Record<string, string>) {
            if (responded) return;
            responded = true;
            res.writeHead(status, { 'Content-Type': 'application/json', ...resHeaders });
            res.end(resBody);
          },
        });

        // Default response if hook didn't respond
        setTimeout(() => {
          if (!responded) {
            responded = true;
            res.writeHead(200);
            res.end('ok');
          }
        }, 5000);
      });
    }

    async stop() {
      await releaseHttpServer(this.port, this.path);
    }
  }

  export function Runner(config: Config = {}): HookHandler<Input> {
    return {
      __hookHandler: true as const,
      runnerClass: RunnerImpl,
      config: config as unknown as Record<string, unknown>,
      initConfig: { http: { port: config.port ?? 3000 } },
    };
  }
}
