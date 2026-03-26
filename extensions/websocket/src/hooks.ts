import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import type { HookRunner, HookHandler } from '@interactkit/sdk';

// ─── WsMessage Hook ─────────────────────────────────────
// Fires on every incoming WebSocket message.

export namespace WsMessage {
  export interface Input {
    data: string;
    clientId: string;
    send: (message: string) => void;
    close: () => void;
  }

  export interface Config {
    port: number;
  }

  class RunnerImpl implements HookRunner<Input> {
    private wss: WebSocketServer | null = null;

    async start(emit: (data: Input) => void, config: Record<string, unknown>) {
      const port = config.port as number;
      let clientCounter = 0;

      this.wss = new WebSocketServer({ port });

      this.wss.on('connection', (ws: WsSocket) => {
        const clientId = `ws-${++clientCounter}`;

        ws.on('message', (raw: Buffer) => {
          emit({
            data: raw.toString(),
            clientId,
            send: (msg: string) => ws.send(msg),
            close: () => ws.close(),
          });
        });
      });
    }

    async stop() {
      if (this.wss) {
        for (const client of this.wss.clients) client.close();
        await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
        this.wss = null;
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

// ─── WsConnection Hook ──────────────────────────────────
// Fires when a new client connects.

export namespace WsConnection {
  export interface Input {
    clientId: string;
    send: (message: string) => void;
    close: () => void;
  }

  export interface Config {
    port: number;
  }

  class RunnerImpl implements HookRunner<Input> {
    private wss: WebSocketServer | null = null;

    async start(emit: (data: Input) => void, config: Record<string, unknown>) {
      const port = config.port as number;
      let clientCounter = 0;

      this.wss = new WebSocketServer({ port });

      this.wss.on('connection', (ws: WsSocket) => {
        const clientId = `ws-${++clientCounter}`;
        emit({
          clientId,
          send: (msg: string) => ws.send(msg),
          close: () => ws.close(),
        });
      });
    }

    async stop() {
      if (this.wss) {
        for (const client of this.wss.clients) client.close();
        await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
        this.wss = null;
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
