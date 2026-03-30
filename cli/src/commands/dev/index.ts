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
  const allPath = resolve(cwd, '.interactkit/build/src/_all.js');
  const fallbackPath = resolve(cwd, '.interactkit/build/src/_entry.js');

  // Start in-memory pub/sub server
  const pubsubServer = await startPubSubServer(DEV_PUBSUB_PORT);
  console.log(`▸ pubsub server: localhost:${DEV_PUBSUB_PORT} (in-memory)`);

  // Initial build
  await buildCommand({ ...flags, dev: true });

  let appProcess: ChildProcess | null = null;

  function startApp() {
    console.log('\n▸ starting app...');
    const entryPath = existsSync(allPath) ? allPath : fallbackPath;
    appProcess = spawn('node', [entryPath], {
      stdio: 'inherit',
      cwd,
    });
    appProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.log(`\n▸ app exited with code ${code}`);
      }
      appProcess = null;
    });
  }

  function stopApp(): Promise<void> {
    return new Promise((resolve) => {
      if (!appProcess) return resolve();
      appProcess.on('exit', () => resolve());
      appProcess.kill('SIGTERM');
      setTimeout(() => {
        if (appProcess) appProcess.kill('SIGKILL');
        resolve();
      }, 3000);
    });
  }

  async function rebuild() {
    await stopApp();
    try {
      await buildCommand({ ...flags, dev: true });
      startApp();
    } catch {
      console.log('\n▸ build failed, waiting for changes...');
    }
  }

  startApp();

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
  watch(envPath, () => {
    scheduleRestart('.env');
  });

  process.on('SIGINT', async () => {
    await stopApp();
    pubsubServer.close();
    process.exit(0);
  });
}
