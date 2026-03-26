import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { HookRunner, HookHandler } from '@interactkit/sdk';

// ─── HttpRequest Hook ────────────────────────────────────
// Fires on every incoming HTTP request matching the configured path.

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
    port: number;
    path?: string;
  }

  class RunnerImpl implements HookRunner<Input> {
    private server: Server | null = null;

    async start(emit: (data: Input) => void, config: Record<string, unknown>) {
      const port = config.port as number;
      const prefix = (config.path as string) ?? '/';

      this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`);

        if (!url.pathname.startsWith(prefix)) {
          res.writeHead(404);
          res.end();
          return;
        }

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

      this.server.listen(port);
    }

    async stop() {
      if (this.server) {
        await new Promise<void>((resolve) => this.server!.close(() => resolve()));
        this.server = null;
      }
    }
  }

  export function Runner(config: Config): HookHandler<Input> {
    return {
      __hookHandler: true as const,
      runnerClass: RunnerImpl,
      config: config as unknown as Record<string, unknown>,
    };
  }
}
