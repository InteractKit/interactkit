import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { startPubSubServer } from '../dev/pubsub-server.js';

const DEV_PUBSUB_PORT = 6400;

export async function startCommand() {
  const cwd = process.cwd();
  const buildDir = resolve(cwd, '.interactkit/build/src');
  const entryPath = resolve(buildDir, '_entry.js');

  if (!existsSync(entryPath)) {
    console.error('No build found. Run `interactkit build` first.');
    process.exit(1);
  }

  // Start in-memory pub/sub server (needed for DevPubSubAdapter + remote hooks)
  const pubsubServer = await startPubSubServer(DEV_PUBSUB_PORT);
  console.log(`▸ pubsub server: localhost:${DEV_PUBSUB_PORT}`);

  const children: ChildProcess[] = [];

  function spawnChild(script: string, label: string): ChildProcess | null {
    const path = resolve(buildDir, script);
    if (!existsSync(path)) return null;
    const child = spawn('node', [path], { stdio: 'inherit', cwd });
    child.on('exit', (code) => {
      if (code !== null && code !== 0) console.log(`▸ ${label} exited with code ${code}`);
    });
    children.push(child);
    return child;
  }

  // 1. Start hooks process first (HTTP server, cron, etc.)
  spawnChild('_hooks.js', 'hooks');

  // 2. Small delay to let hooks start consuming before entity boot sends register events
  await new Promise(r => setTimeout(r, 200));

  // 3. Entity process
  const entryScript = existsSync(resolve(buildDir, '_all.js')) ? '_all.js' : '_entry.js';
  spawnChild(entryScript, 'app');

  // 4. Observer (after entity boot)
  setTimeout(() => {
    spawnChild('_observer.js', 'observer');
  }, 500);

  console.log('▸ started');

  process.on('SIGINT', () => {
    for (const child of children) {
      if (!child.killed && child.exitCode === null) child.kill('SIGTERM');
    }
    pubsubServer.close();
    setTimeout(() => process.exit(0), 1000);
  });
}
