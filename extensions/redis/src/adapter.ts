import { Redis } from 'ioredis';
import { RemotePubSubAdapter } from '@interactkit/sdk';

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  url?: string;
}

/**
 * Redis-backed adapter with two delivery modes:
 *
 * - broadcast (publishRaw/subscribeRaw): Redis pub/sub — all subscribers get every message
 * - queue (enqueueRaw/consumeRaw): Redis lists + pub/sub notification — one consumer picks each message
 *
 * Connections are lazy — no Redis connections are created until the first operation.
 */
export class RedisPubSubAdapter extends RemotePubSubAdapter {
  private broadcastHandlers = new Map<string, (message: string) => void>();
  private consumerHandlers = new Map<string, (message: string) => void>();
  private consumerActive = new Map<string, boolean>();
  private _pub: Redis | null = null;
  private _sub: Redis | null = null;
  private _cmd: Redis | null = null;
  private connected = false;
  private readonly redisConfig!: RedisConfig;

  private static _instance: RedisPubSubAdapter | null = null;

  /**
   * Singleton — multiple `new RedisPubSubAdapter()` calls return the same instance.
   * Pass connection config directly: `new RedisPubSubAdapter({ url: 'redis://...' })`
   * or `new RedisPubSubAdapter({ host: 'localhost', port: 6379 })`.
   * Defaults to localhost:6379 if no config provided.
   */
  constructor(config: RedisConfig = {}) {
    if (RedisPubSubAdapter._instance) return RedisPubSubAdapter._instance;
    super();
    RedisPubSubAdapter._instance = this;
    this.redisConfig = config;
  }

  private ensureConnected(): void {
    if (this.connected) return;
    this.connected = true;

    const cfg = this.redisConfig;
    const mkRedis = () => {
      const opts = { maxRetriesPerRequest: 3, retryStrategy: (t: number) => t > 3 ? null : Math.min(t * 200, 2000) };
      return cfg.url ? new Redis(cfg.url, opts) : new Redis({ host: cfg.host ?? 'localhost', port: cfg.port ?? 6379, password: cfg.password, db: cfg.db, ...opts });
    };
    this._pub = mkRedis();
    this._sub = mkRedis();
    this._cmd = mkRedis();

    const cleanup = () => { this.disconnect(); };
    process.on('exit', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

    this._sub.on('message', (channel: string, _message: string) => {
      const broadcastHandler = this.broadcastHandlers.get(channel);
      if (broadcastHandler) { broadcastHandler(_message); return; }
      if (channel.startsWith('notify:')) {
        this.drain(channel.slice('notify:'.length)).catch(() => {});
      }
    });
  }

  private get pub(): Redis { this.ensureConnected(); return this._pub!; }
  private get sub(): Redis { this.ensureConnected(); return this._sub!; }
  private get cmd(): Redis { this.ensureConnected(); return this._cmd!; }

  protected async publishRaw(channel: string, message: string): Promise<void> { await this.pub.publish(channel, message); }
  protected async subscribeRaw(channel: string, handler: (message: string) => void): Promise<void> { this.broadcastHandlers.set(channel, handler); await this.sub.subscribe(channel); }
  protected async unsubscribeRaw(channel: string): Promise<void> { this.broadcastHandlers.delete(channel); await this.sub.unsubscribe(channel); }
  protected async enqueueRaw(channel: string, message: string): Promise<void> { await this.cmd.lpush(`queue:${channel}`, message); await this.pub.publish(`notify:${channel}`, '1'); }
  protected async consumeRaw(channel: string, handler: (message: string) => void): Promise<void> { this.consumerHandlers.set(channel, handler); this.consumerActive.set(channel, true); await this.sub.subscribe(`notify:${channel}`); this.drain(channel).catch(() => {}); }
  protected async stopConsumingRaw(channel: string): Promise<void> { this.consumerActive.set(channel, false); this.consumerHandlers.delete(channel); await this.sub.unsubscribe(`notify:${channel}`); }

  async disconnect(): Promise<void> {
    if (this._pub) this._pub.disconnect();
    if (this._sub) this._sub.disconnect();
    if (this._cmd) this._cmd.disconnect();
    this._pub = this._sub = this._cmd = null;
    this.connected = false;
    RedisPubSubAdapter._instance = null;
  }

  private async drain(channel: string): Promise<void> {
    const handler = this.consumerHandlers.get(channel);
    if (!handler) return;
    while (this.consumerActive.get(channel)) {
      const message = await this.cmd.rpop(`queue:${channel}`);
      if (!message) break;
      try { handler(message); } catch { /* sync errors */ }
    }
  }
}
