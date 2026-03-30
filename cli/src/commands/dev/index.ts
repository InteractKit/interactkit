import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { watch } from 'node:fs';
import { buildCommand } from '@/commands/build/index.js';
import { startPubSubServer } from './pubsub-server.js';

const DEV_PUBSUB_PORT = 6400;

interface Flags {
  project: string;
  outDir: string;
  root?: string;
}

export async function devCommand(flags: Flags) {
  const cwd = process.cwd();
  const buildDir = resolve(cwd, '.interactkit/build/src');

  // Start in-memory pub/sub server
  const pubsubServer = await startPubSubServer(DEV_PUBSUB_PORT);
  console.log(`▸ pubsub server: localhost:${DEV_PUBSUB_PORT} (in-memory)`);

  // Initial build
  await buildCommand({ ...flags, dev: true });

  // Managed child processes
  const children: ChildProcess[] = [];

  function spawnChild(script: string, label: string): ChildProcess | null {
    const path = resolve(buildDir, script);
    if (!existsSync(path)) return null;
    const child = spawn('node', [path], { stdio: 'inherit', cwd });
    child.on('exit', (code) => {
      if (code !== null && code !== 0) console.log(`\n▸ ${label} exited with code ${code}`);
    });
    children.push(child);
    return child;
  }

  function killAll(): Promise<void> {
    return new Promise((resolve) => {
      let alive = children.filter(c => !c.killed && c.exitCode === null).length;
      if (alive === 0) return resolve();

      for (const child of children) {
        if (!child.killed && child.exitCode === null) {
          child.on('exit', () => { if (--alive <= 0) resolve(); });
          child.kill('SIGTERM');
        }
      }

      setTimeout(() => {
        for (const child of children) {
          if (!child.killed && child.exitCode === null) child.kill('SIGKILL');
        }
        resolve();
      }, 3000);
    });
  }

  function startAll() {
    console.log('\n▸ starting...');
    children.length = 0;

    // 1. Hooks first (they need to be consuming before entities register)
    spawnChild('_hooks.js', 'hooks');

    // Small delay to let hooks start consuming before entity boot sends register events
    setTimeout(() => {
      // 2. Entity process
      const entryScript = existsSync(resolve(buildDir, '_all.js')) ? '_all.js' : '_entry.js';
      spawnChild(entryScript, 'app');

      // 3. Observer (after entity boot, so bridge is listening)
      setTimeout(() => {
        spawnChild('_observer.js', 'observer');
      }, 500);
    }, 200);
  }

  async function rebuild() {
    await killAll();
    try {
      await buildCommand({ ...flags, dev: true });
      startAll();
    } catch {
      console.log('\n▸ build failed, waiting for changes...');
    }
  }

  startAll();

  console.log('\n▸ watching for changes...');
  const srcDir = resolve(cwd, 'src');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleRestart(label: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`\n▸ ${label} changed, rebuilding...`);
      rebuild();
    }, 300);
  }

  watch(srcDir, { recursive: true }, (_event, filename) => {
    if (!filename?.endsWith('.ts')) return;
    scheduleRestart(filename);
  });

  const envPath = resolve(cwd, '.env');
  if (existsSync(envPath)) {
    watch(envPath, () => scheduleRestart('.env'));
  }

  process.on('SIGINT', async () => {
    await killAll();
    pubsubServer.close();
    process.exit(0);
  });
}
