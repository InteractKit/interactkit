import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

interface Flags {
  entry: string;
}

export async function startCommand(_flags: Flags) {
  const cwd = process.cwd();
  const entryPath = resolve(cwd, '.interactkit/build/src/_entry.js');

  if (!existsSync(entryPath)) {
    console.error('No build found. Run `interactkit build` first.');
    process.exit(1);
  }

  console.log('▸ starting');
  const child = spawn('node', [entryPath], {
    stdio: 'inherit',
    cwd,
  });

  child.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });
}
