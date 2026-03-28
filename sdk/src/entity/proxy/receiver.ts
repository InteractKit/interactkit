import { randomUUID } from 'node:crypto';
import type { ProxyMessage } from './types.js';
import { isSerializable, classifyForProxy } from './serializable.js';

/** Raw transport — accepts PubSubAdapter cast as any to access protected raw methods. */
export type ProxyTransport = any;

/**
 * Receives proxy operations on a channel, resolves them against
 * registered objects, and sends responses back.
 */
export class ProxyReceiver {
  private objects = new Map<string, unknown>();
  private transport: ProxyTransport;
  private channel: string;
  private listening = false;

  constructor(channel: string, transport: ProxyTransport) {
    this.channel = channel;
    this.transport = transport;
  }

  register(object: unknown, id?: string): string {
    const objectId = id ?? randomUUID();
    this.objects.set(objectId, object);
    return objectId;
  }

  async listen(): Promise<void> {
    if (this.listening) return;
    this.listening = true;

    await this.transport.consumeRaw(this.channel, async (raw: string) => {
      const message: ProxyMessage = JSON.parse(raw);
      if (message.op === 'response') return;

      const response: ProxyMessage = {
        correlationId: message.correlationId,
        objectId: message.objectId,
        op: 'response',
      };

      try {
        const obj = this.objects.get(message.objectId);
        if (obj === undefined && message.op !== 'dispose') {
          response.error = `Object "${message.objectId}" not found`;
        } else {
          switch (message.op) {
            case 'get': {
              this.packResponse(response, (obj as any)[message.prop!]);
              break;
            }
            case 'set': {
              (obj as any)[message.prop!] = message.args?.[0];
              break;
            }
            case 'call': {
              let result: unknown;
              if (message.prop) {
                const fn = (obj as any)[message.prop];
                if (typeof fn !== 'function') { response.error = `"${message.prop}" is not a function`; break; }
                result = await fn.apply(obj, message.args ?? []);
              } else {
                if (typeof obj !== 'function') { response.error = `Object is not callable`; break; }
                result = await (obj as Function).apply(null, message.args ?? []);
              }
              this.packResponse(response, result);
              break;
            }
            case 'dispose': {
              this.objects.delete(message.objectId);
              break;
            }
          }
        }
      } catch (err: any) {
        response.error = err.message ?? String(err);
      }

      const replyTo = message.replyChannel ?? this.channel;
      await this.transport.publishRaw(replyTo, JSON.stringify(response));
    });
  }

  private packResponse(response: ProxyMessage, value: unknown): void {
    if (value === undefined) {
      response.value = undefined;
    } else if (isSerializable(value)) {
      response.value = value;
    } else {
      const proxyId = this.register(value);
      response.proxyId = proxyId;
      response.proxyKind = classifyForProxy(value);
    }
  }

  async dispose(): Promise<void> {
    this.objects.clear();
    this.listening = false;
    await this.transport.stopConsumingRaw(this.channel);
  }
}
