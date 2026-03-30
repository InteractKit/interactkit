import { connect, type Socket } from 'node:net';
import { RemotePubSubAdapter } from './adapter.js';

/**
 * Connects to the CLI's in-memory pub/sub server over TCP.
 * Drop-in replacement for RedisPubSubAdapter during local dev.
 * No Redis required — the CLI starts the server automatically.
 */
export class DevPubSubAdapter extends RemotePubSubAdapter {
  private socket: Socket | null = null;
  private handlers = new Map<string, (data: string) => void>();
  private connected = false;
  private buffer = '';
  private readonly port: number;
  private readonly host: string;

  constructor(config: { port?: number; host?: string } = {}) {
    super();
    this.port = config.port ?? 6400;
    this.host = config.host ?? 'localhost';
  }

  private ensureConnected(): Socket {
    if (this.socket && this.connected) return this.socket;
    this.socket = connect({ port: this.port, host: this.host });
    this.connected = true;

    this.socket.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as { op: string; channel: string; data: string };
          if (msg.op === 'message') {
            const handler = this.handlers.get(msg.channel);
            if (handler) handler(msg.data);
          }
        } catch { /* ignore */ }
      }
    });

    this.socket.on('error', () => {});
    this.socket.on('close', () => { this.connected = false; });

    return this.socket;
  }

  private send(msg: object): void {
    this.ensureConnected().write(JSON.stringify(msg) + '\n');
  }

  protected async publishRaw(channel: string, message: string): Promise<void> {
    this.send({ op: 'publish', channel, data: message });
  }

  protected async subscribeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    this.handlers.set(channel, handler);
    this.send({ op: 'subscribe', channel });
  }

  protected async unsubscribeRaw(channel: string): Promise<void> {
    this.handlers.delete(channel);
    this.send({ op: 'unsubscribe', channel });
  }

  protected async enqueueRaw(channel: string, message: string): Promise<void> {
    this.send({ op: 'enqueue', channel, data: message });
  }

  protected async consumeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    this.handlers.set(channel, handler);
    this.send({ op: 'consume', channel });
  }

  protected async stopConsumingRaw(channel: string): Promise<void> {
    this.handlers.delete(channel);
    this.send({ op: 'stop_consuming', channel });
  }
}
