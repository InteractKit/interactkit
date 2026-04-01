import { connect, type Socket } from 'node:net';
import { RemotePubSubAdapter } from './adapter.js';

/**
 * Connects to the CLI's in-memory pub/sub server over TCP.
 * Drop-in replacement for RedisPubSubAdapter during local dev.
 * No Redis required — the CLI starts the server automatically.
 */
export class DevPubSubAdapter extends RemotePubSubAdapter {
  private socket: Socket | null = null;
  private handlers = new Map<string, Set<(data: string) => void>>();
  private buffer = '';
  private ready: Promise<void> | null = null;
  private readonly port: number;
  private readonly host: string;

  constructor(config: { port?: number; host?: string } = {}) {
    super();
    this.port = config.port ?? 6400;
    this.host = config.host ?? 'localhost';
  }

  private ensureConnected(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve) => {
      this.socket = connect({ port: this.port, host: this.host }, () => resolve());

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
              const handlers = this.handlers.get(msg.channel);
              if (handlers) for (const h of handlers) h(msg.data);
            }
          } catch { /* ignore */ }
        }
      });

      this.socket.on('error', () => {});
      this.socket.on('close', () => { this.ready = null; this.socket = null; });
    });

    return this.ready;
  }

  private async send(msg: object): Promise<void> {
    await this.ensureConnected();
    this.socket!.write(JSON.stringify(msg) + '\n');
  }

  protected async publishRaw(channel: string, message: string): Promise<void> {
    await this.send({ op: 'publish', channel, data: message });
  }

  protected async subscribeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    const set = this.handlers.get(channel) ?? new Set();
    const wasEmpty = set.size === 0;
    set.add(handler);
    this.handlers.set(channel, set);
    if (wasEmpty) await this.send({ op: 'subscribe', channel });
  }

  protected async unsubscribeRaw(channel: string): Promise<void> {
    this.handlers.delete(channel);
    await this.send({ op: 'unsubscribe', channel });
  }

  protected async enqueueRaw(channel: string, message: string): Promise<void> {
    await this.send({ op: 'enqueue', channel, data: message });
  }

  protected async consumeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    const set = this.handlers.get(channel) ?? new Set();
    const wasEmpty = set.size === 0;
    set.add(handler);
    this.handlers.set(channel, set);
    if (wasEmpty) await this.send({ op: 'consume', channel });
  }

  protected async stopConsumingRaw(channel: string): Promise<void> {
    this.handlers.delete(channel);
    await this.send({ op: 'stop_consuming', channel });
  }
}
