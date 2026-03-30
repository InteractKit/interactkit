import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import { createRequire } from "node:module";
import { WebSocketServer, WebSocket } from "ws";
import { BaseObserver } from "@interactkit/sdk";
import type { EventEnvelope } from "@interactkit/sdk";
import type {
  ClientMessage,
  ServerMessage,
  EventMessage,
  ErrorMessage,
} from "./protocol.js";

export interface DashboardObserverOptions {
  /** HTTP + WebSocket server port. Default: 4200 */
  port?: number;
  /** Auth token. Clients must send this to authenticate. */
  token?: string;
}

interface AuthedClient {
  ws: WebSocket;
  authed: boolean;
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
};

/**
 * Observer that serves the dashboard UI over HTTP and exposes
 * a WebSocket server for real-time communication.
 *
 * Open http://localhost:4200 to view the dashboard.
 */
export class DashboardObserver extends BaseObserver {
  private wss: WebSocketServer | null = null;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private clients = new Set<AuthedClient>();
  private readonly port: number;
  private readonly token: string | undefined;
  private uiDir: string | null = null;

  constructor(options: DashboardObserverOptions = {}) {
    super();
    this.port = options.port ?? 4200;
    this.token = options.token;
    this.uiDir = this.resolveUiDir();
  }

  // ─── Lifecycle ─────────────────────────────────────────

  override async connect(
    pubsub: Parameters<BaseObserver["connect"]>[0],
  ): Promise<void> {
    await super.connect(pubsub);
    this.start();
  }

  // ─── BaseObserver implementation ──────────────────────

  event(envelope: EventEnvelope): void {
    const msg: EventMessage = { type: "event", envelope };
    this.broadcastWs(msg);
    this.emit("event", envelope);
  }

  error(envelope: EventEnvelope, error: Error): void {
    const msg: ErrorMessage = {
      type: "error",
      envelope,
      error: { message: error.message, stack: error.stack },
    };
    this.broadcastWs(msg);
    this.emit("error", envelope, error);
  }

  // ─── HTTP + WebSocket server ──────────────────────────

  start(): void {
    if (this.httpServer) return;

    this.httpServer = createServer((req, res) => this.handleHttp(req, res));

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (ws) => {
      const client: AuthedClient = { ws, authed: !this.token };

      if (client.authed) {
        this.clients.add(client);
      }

      ws.on("message", (raw) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        this.handleMessage(client, msg);
      });

      ws.on("close", () => this.clients.delete(client));
      ws.on("error", () => this.clients.delete(client));
    });

    this.httpServer.listen(this.port, () => {
      console.log(`▸ observer dashboard: http://localhost:${this.port}`);
    });
  }

  stop(): void {
    this.wss?.close();
    this.httpServer?.close();
    this.wss = null;
    this.httpServer = null;
    this.clients.clear();
  }

  // ─── Static file serving ──────────────────────────────

  private resolveUiDir(): string | null {
    try {
      const require = createRequire(import.meta.url);
      const uiPkg = require.resolve("@interactkit/observer-ui/package.json");
      const outDir = resolve(uiPkg, "../out");
      if (existsSync(outDir)) return outDir;
    } catch { /* not installed or not built */ }
    return null;
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    if (!this.uiDir) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body style='background:#09090b;color:#a1a1aa;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh'>" +
          "<div><h1 style='color:#fafafa'>InteractKit Observer</h1><p>Dashboard UI not found. Run <code>pnpm build</code> in observer-ui.</p>" +
          `<p>WebSocket available at ws://localhost:${this.port}</p></div></body></html>`,
      );
      return;
    }

    let pathname = new URL(req.url ?? "/", "http://localhost").pathname;

    // Try exact file, then .html, then /index.html
    let filePath = join(this.uiDir, pathname);
    const isDir = existsSync(filePath) && statSync(filePath).isDirectory();
    if (!existsSync(filePath) || isDir) {
      const withHtml = filePath.replace(/\/$/, "") + ".html";
      const withIndex = join(filePath, "index.html");
      if (existsSync(withHtml) && !statSync(withHtml).isDirectory()) filePath = withHtml;
      else if (existsSync(withIndex)) filePath = withIndex;
      else {
        // SPA fallback
        filePath = join(this.uiDir, "index.html");
      }
    }

    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = extname(filePath);
    const mime = MIME[ext] || "application/octet-stream";
    const body = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime });
    res.end(body);
  }

  // ─── WS message handling ──────────────────────────────

  private handleMessage(client: AuthedClient, msg: ClientMessage): void {
    if (msg.type === "auth") {
      if (!this.token || msg.token === this.token) {
        client.authed = true;
        this.clients.add(client);
        this.send(client.ws, { type: "auth:result", ok: true });
      } else {
        this.send(client.ws, {
          type: "auth:result",
          ok: false,
          error: "Invalid token",
        });
      }
      return;
    }

    if (!client.authed) {
      this.send(client.ws, {
        type: "auth:result",
        ok: false,
        error: "Not authenticated",
      });
      return;
    }

    switch (msg.type) {
      case "state:set":
        this.setState(msg.entityId, msg.field, msg.value);
        break;

      case "state:get":
        this.getState(msg.entityId, msg.field)
          .then((value) =>
            this.send(client.ws, { type: "response", requestId: msg.requestId, value }),
          )
          .catch((err) =>
            this.send(client.ws, { type: "response", requestId: msg.requestId, error: err.message }),
          );
        break;

      case "method:call":
        this.callMethod("", msg.method, msg.payload)
          .then((value) =>
            this.send(client.ws, { type: "response", requestId: msg.requestId, value }),
          )
          .catch((err) =>
            this.send(client.ws, { type: "response", requestId: msg.requestId, error: err.message }),
          );
        break;

      case "entity:tree":
        this.getEntityTree()
          .then((value) =>
            this.send(client.ws, { type: "response", requestId: msg.requestId, value }),
          )
          .catch((err) =>
            this.send(client.ws, { type: "response", requestId: msg.requestId, error: err.message }),
          );
        break;
    }
  }

  // ─── Helpers ──────────────────────────────────────────

  private broadcastWs(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.authed && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
