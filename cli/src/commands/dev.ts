import { spawn } from 'node:child_process';
import { buildCommand } from './build.js';

interface Flags {
  project: string;
  outDir: string;
}

export async function devCommand(flags: Flags) {
  // Initial build
  await buildCommand(flags);

  // Watch mode via tsc --watch
  console.log('\n▸ watching for changes...');
  const child = spawn('npx', ['tsc', '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  });

  child.on('exit', (code) => process.exit(code ?? 0));

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });
}
