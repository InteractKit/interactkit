import { Redis } from 'ioredis';
import type { PubSubAdapter } from './adapter.js';
import { resolveRedisConfig } from '../config.js';

/**
 * Redis-backed PubSubAdapter using ioredis.
 *
 * Config resolution (in order):
 *   1. node-config: interactkit.redis.{ host, port, password, db, url }
 *   2. Env vars: REDIS_URL or REDIS_HOST + REDIS_PORT
 *   3. Throws if not configured
 */
export class RedisPubSubAdapter implements PubSubAdapter {
  private handlers = new Map<string, (message: string) => void>();
  private pub: Redis;
  private sub: Redis;

  constructor() {
    const config = resolveRedisConfig();
    const opts = config.url
      ? config.url
      : { host: config.host, port: config.port, password: config.password, db: config.db };

    this.pub = new Redis(opts as any);
    this.sub = new Redis(opts as any);

    this.sub.on('message', (channel: string, message: string) => {
      const handler = this.handlers.get(channel);
      if (handler) handler(message);
    });
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.pub.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    this.handlers.set(channel, handler);
    await this.sub.subscribe(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.handlers.delete(channel);
    await this.sub.unsubscribe(channel);
  }
}
