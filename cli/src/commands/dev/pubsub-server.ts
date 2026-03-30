import { createServer, type Socket } from 'node:net';

/**
 * Lightweight in-memory pub/sub server for local dev.
 * Speaks JSON-line protocol over TCP. Drop-in replacement for Redis
 * pub/sub + list queues — just enough for InteractKit's needs.
 *
 * Protocol (one JSON object per line, newline-delimited):
 *   → { "op": "subscribe", "channel": "foo" }
 *   → { "op": "unsubscribe", "channel": "foo" }
 *   → { "op": "publish", "channel": "foo", "data": "..." }
 *   → { "op": "enqueue", "channel": "foo", "data": "..." }
 *   → { "op": "consume", "channel": "foo" }
 *   → { "op": "stop_consuming", "channel": "foo" }
 *   ← { "op": "message", "channel": "foo", "data": "..." }
 */
export function startPubSubServer(port: number): Promise<ReturnType<typeof createServer>> {
  const subscriptions = new Map<string, Set<Socket>>();
  const queues = new Map<string, string[]>();
  const consumers = new Map<string, Set<Socket>>();
  const roundRobin = new Map<string, number>();

  return new Promise((resolveStart) => {
    const server = createServer((socket) => {
      let buffer = '';

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (!line.trim()) continue;
          try {
            handleMessage(socket, JSON.parse(line));
          } catch { /* ignore malformed */ }
        }
      });

      socket.on('close', () => {
        // Clean up subscriptions for this socket
        for (const subs of subscriptions.values()) subs.delete(socket);
        for (const cons of consumers.values()) cons.delete(socket);
      });

      socket.on('error', () => {});
    });

    function handleMessage(socket: Socket, msg: { op: string; channel: string; data?: string }) {
      switch (msg.op) {
        case 'subscribe': {
          const subs = subscriptions.get(msg.channel) ?? new Set();
          subs.add(socket);
          subscriptions.set(msg.channel, subs);
          break;
        }
        case 'unsubscribe': {
          subscriptions.get(msg.channel)?.delete(socket);
          break;
        }
        case 'publish': {
          const subs = subscriptions.get(msg.channel);
          if (subs) {
            const payload = JSON.stringify({ op: 'message', channel: msg.channel, data: msg.data }) + '\n';
            for (const s of subs) {
              if (!s.destroyed) s.write(payload);
            }
          }
          break;
        }
        case 'enqueue': {
          const cons = consumers.get(msg.channel);
          if (cons && cons.size > 0) {
            // Round-robin to one consumer
            const arr = [...cons];
            const idx = (roundRobin.get(msg.channel) ?? 0) % arr.length;
            roundRobin.set(msg.channel, idx + 1);
            const target = arr[idx];
            if (!target.destroyed) {
              target.write(JSON.stringify({ op: 'message', channel: msg.channel, data: msg.data }) + '\n');
            }
          } else {
            // Queue it
            const q = queues.get(msg.channel) ?? [];
            q.push(msg.data!);
            queues.set(msg.channel, q);
          }
          break;
        }
        case 'consume': {
          const cons = consumers.get(msg.channel) ?? new Set();
          cons.add(socket);
          consumers.set(msg.channel, cons);
          // Drain queued messages
          const q = queues.get(msg.channel);
          if (q && q.length > 0) {
            queues.delete(msg.channel);
            for (const data of q) {
              if (!socket.destroyed) {
                socket.write(JSON.stringify({ op: 'message', channel: msg.channel, data }) + '\n');
              }
            }
          }
          break;
        }
        case 'stop_consuming': {
          consumers.get(msg.channel)?.delete(socket);
          break;
        }
      }
    }

    server.listen(port, () => {
      resolveStart(server);
    });
  });
}
