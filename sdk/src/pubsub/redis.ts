import { Redis } from 'ioredis';
import { RemotePubSubAdapter } from './adapter.js';
import { resolveRedisConfig } from '../config.js';

/**
 * Redis-backed adapter with two delivery modes:
 *
 * - broadcast (publishRaw/subscribeRaw): Redis pub/sub — all subscribers get every message
 * - queue (enqueueRaw/consumeRaw): Redis lists + pub/sub notification — one consumer picks each message
 *
 * Non-serializable values (functions, class instances) are automatically proxied
 * via RemotePubSubAdapter's built-in proxy system.
 */
export class RedisPubSubAdapter extends RemotePubSubAdapter {
  private broadcastHandlers = new Map<string, (message: string) => void>();
  private consumerHandlers = new Map<string, (message: string) => void>();
  private consumerActive = new Map<string, boolean>();
  private pub: Redis;
  private sub: Redis;
  private cmd: Redis;

  constructor() {
    super();
    const config = resolveRedisConfig();
    const opts = config.url
      ? config.url
      : { host: config.host, port: config.port, password: config.password, db: config.db };

    this.pub = new Redis(opts as any);
    this.sub = new Redis(opts as any);
    this.cmd = new Redis(opts as any);

    this.sub.on('message', (channel: string, _message: string) => {
      const broadcastHandler = this.broadcastHandlers.get(channel);
      if (broadcastHandler) {
        broadcastHandler(_message);
        return;
      }
      if (channel.startsWith('notify:')) {
        const queueChannel = channel.slice('notify:'.length);
        this.drain(queueChannel);
      }
    });
  }

  protected async publishRaw(channel: string, message: string): Promise<void> {
    await this.pub.publish(channel, message);
  }

  protected async subscribeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    this.broadcastHandlers.set(channel, handler);
    await this.sub.subscribe(channel);
  }

  protected async unsubscribeRaw(channel: string): Promise<void> {
    this.broadcastHandlers.delete(channel);
    await this.sub.unsubscribe(channel);
  }

  protected async enqueueRaw(channel: string, message: string): Promise<void> {
    await this.cmd.lpush(`queue:${channel}`, message);
    await this.pub.publish(`notify:${channel}`, '1');
  }

  protected async consumeRaw(channel: string, handler: (message: string) => void): Promise<void> {
    this.consumerHandlers.set(channel, handler);
    this.consumerActive.set(channel, true);
    await this.sub.subscribe(`notify:${channel}`);
    this.drain(channel);
  }

  protected async stopConsumingRaw(channel: string): Promise<void> {
    this.consumerActive.set(channel, false);
    this.consumerHandlers.delete(channel);
    await this.sub.unsubscribe(`notify:${channel}`);
  }

  private async drain(channel: string): Promise<void> {
    const handler = this.consumerHandlers.get(channel);
    if (!handler) return;
    while (this.consumerActive.get(channel)) {
      const message = await this.cmd.rpop(`queue:${channel}`);
      if (!message) break;
      handler(message);
    }
  }
}
