import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import type { RemoteHookRunner, RemoteHookHandler } from '@interactkit/sdk';

// ─── Centralized WebSocket Server Pool ─────────────────────
// Shares a single WebSocketServer per port across all WS hook runners.
// WsMessage and WsConnection hooks on the same port share the server
// and client ID counter. Multiple handlers fan out to all listeners.

type MessageHandler = (data: string, clientId: string, send: (msg: string) => void, close: () => void) => void;
type ConnectionHandler = (clientId: string, send: (msg: string) => void, close: () => void) => void;

interface ManagedWsServer {
  wss: WebSocketServer;
  clientCounter: number;
  messageHandlers: Set<MessageHandler>;
  connectionHandlers: Set<ConnectionHandler>;
  refCount: number;
}

const wsPool = new Map<number, ManagedWsServer>();

function acquireWsServer(port: number): ManagedWsServer {
  let managed = wsPool.get(port);
  if (!managed) {
    const wss = new WebSocketServer({ port });
    managed = {
      wss,
      clientCounter: 0,
      messageHandlers: new Set(),
      connectionHandlers: new Set(),
      refCount: 0,
    };
    const m = managed;
    wsPool.set(port, managed);

    wss.on('connection', (ws: WsSocket) => {
      const clientId = `ws-${++m.clientCounter}`;
      const send = (msg: string) => ws.send(msg);
      const close = () => ws.close();

      for (const handler of m.connectionHandlers) {
        handler(clientId, send, close);
      }

      ws.on('message', (raw: Buffer) => {
        const data = raw.toString();
        for (const handler of m.messageHandlers) {
          handler(data, clientId, send, close);
        }
      });
    });
  }
  managed.refCount++;
  return managed;
}

function releaseWsServer(port: number, handler: MessageHandler | ConnectionHandler, type: 'message' | 'connection'): Promise<void> {
  const managed = wsPool.get(port);
  if (!managed) return Promise.resolve();

  if (type === 'message') {
    managed.messageHandlers.delete(handler as MessageHandler);
  } else {
    managed.connectionHandlers.delete(handler as ConnectionHandler);
  }

  managed.refCount--;
  if (managed.refCount === 0) {
    wsPool.delete(port);
    for (const client of managed.wss.clients) client.close();
    return new Promise<void>((resolve) => managed.wss.close(() => resolve()));
  }
  return Promise.resolve();
}

// ─── WsMessage Hook ─────────────────────────────────────
// Init config (from interactkit.config.ts): { ws: { port: 8080 } }
// Run config (from @Hook decorator): per-entity overrides

export namespace WsMessage {
  export interface Input {
    data: string;
    clientId: string;
    send: (message: string) => void;
    close: () => void;
  }

  export interface Config {
    port?: number;
  }

  class RunnerImpl implements RemoteHookRunner<Input> {
    private port = 0;
    private handler: MessageHandler | null = null;

    async init(config: Record<string, unknown>) {
      const ws = config.ws as Record<string, unknown> | undefined;
      this.port = (ws?.port as number) ?? 8080;
    }

    register(emit: (data: Input) => void, config: Record<string, unknown>) {
      if (config.port) this.port = config.port as number;
      this.handler = (data, clientId, send, close) => {
        emit({ data, clientId, send, close });
      };
      const managed = acquireWsServer(this.port);
      managed.messageHandlers.add(this.handler);
    }

    async stop() {
      if (this.handler) {
        await releaseWsServer(this.port, this.handler, 'message');
        this.handler = null;
      }
    }
  }

  export function Runner(config: Config = {}): RemoteHookHandler<Input> {
    return {
      __hookHandler: true as const,
      runnerClass: RunnerImpl,
      config: config as unknown as Record<string, unknown>,
      initConfig: { ws: { port: config.port ?? 8080 } },
      inProcess: false,
    };
  }
}

// ─── WsConnection Hook ──────────────────────────────────
// Fires when a new client connects.

export namespace WsConnection {
  export interface Input {
    clientId: string;
    send: (message: string) => void;
    close: () => void;
  }

  export interface Config {
    port?: number;
  }

  class RunnerImpl implements RemoteHookRunner<Input> {
    private port = 0;
    private handler: ConnectionHandler | null = null;

    async init(config: Record<string, unknown>) {
      const ws = config.ws as Record<string, unknown> | undefined;
      this.port = (ws?.port as number) ?? 8080;
    }

    register(emit: (data: Input) => void, config: Record<string, unknown>) {
      if (config.port) this.port = config.port as number;
      this.handler = (clientId, send, close) => {
        emit({ clientId, send, close });
      };
      const managed = acquireWsServer(this.port);
      managed.connectionHandlers.add(this.handler);
    }

    async stop() {
      if (this.handler) {
        await releaseWsServer(this.port, this.handler, 'connection');
        this.handler = null;
      }
    }
  }

  export function Runner(config: Config = {}): RemoteHookHandler<Input> {
    return {
      __hookHandler: true as const,
      runnerClass: RunnerImpl,
      config: config as unknown as Record<string, unknown>,
      initConfig: { ws: { port: config.port ?? 8080 } },
      inProcess: false,
    };
  }
}
