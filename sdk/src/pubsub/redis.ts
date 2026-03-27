import { Redis } from 'ioredis';
import type { PubSubAdapter } from './adapter.js';
import { resolveRedisConfig } from '../config.js';

/**
 * Redis-backed adapter with two delivery modes:
 *
 * - broadcast (publish/subscribe): Redis pub/sub — all subscribers get every message
 * - queue (enqueue/consume): Redis lists + pub/sub notification — one consumer picks each message
 *
 * Queue mode enables horizontal scaling: run 3 replicas of an entity and
 * only one processes each request.
 */
export class RedisPubSubAdapter implements PubSubAdapter {
  private broadcastHandlers = new Map<string, (message: string) => void>();
  private consumerHandlers = new Map<string, (message: string) => void>();
  private consumerActive = new Map<string, boolean>();
  private pub: Redis;
  private sub: Redis;
  private cmd: Redis;

  constructor() {
    const config = resolveRedisConfig();
    const opts = config.url
      ? config.url
      : { host: config.host, port: config.port, password: config.password, db: config.db };

    this.pub = new Redis(opts as any);
    this.sub = new Redis(opts as any);
    this.cmd = new Redis(opts as any);

    this.sub.on('message', (channel: string, _message: string) => {
      // Broadcast channels: deliver message directly
      const broadcastHandler = this.broadcastHandlers.get(channel);
      if (broadcastHandler) {
        broadcastHandler(_message);
        return;
      }

      // Queue notification channels: trigger a drain
      if (channel.startsWith('notify:')) {
        const queueChannel = channel.slice('notify:'.length);
        this.drain(queueChannel);
      }
    });
  }

  // --- Broadcast (Redis pub/sub) ---

  async publish(channel: string, message: string): Promise<void> {
    await this.pub.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    this.broadcastHandlers.set(channel, handler);
    await this.sub.subscribe(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.broadcastHandlers.delete(channel);
    await this.sub.unsubscribe(channel);
  }

  // --- Queue (Redis lists + notification) ---

  async enqueue(channel: string, message: string): Promise<void> {
    await this.cmd.lpush(`queue:${channel}`, message);
    await this.pub.publish(`notify:${channel}`, '1');
  }

  async consume(channel: string, handler: (message: string) => void): Promise<void> {
    this.consumerHandlers.set(channel, handler);
    this.consumerActive.set(channel, true);
    await this.sub.subscribe(`notify:${channel}`);
    // Drain anything already in the queue
    this.drain(channel);
  }

  async stopConsuming(channel: string): Promise<void> {
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
