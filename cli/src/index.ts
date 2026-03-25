#!/usr/bin/env node

import { buildCommand } from './commands/build.js';
import { devCommand } from './commands/dev.js';
import { startCommand } from './commands/start.js';

const HELP = `
interactkit — CLI for InteractKit projects

Commands:
  build     Run codegen + TypeScript compilation
  dev       Run codegen + build in watch mode
  start     Start the application

Options:
  --project, -p  Path to tsconfig.json (default: ./tsconfig.json)
  --help, -h     Show this help

Usage:
  interactkit build
  interactkit dev
  interactkit start
`.trim();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  const flags = parseFlags(args.slice(1));

  switch (command) {
    case 'build':
      await buildCommand(flags);
      break;
    case 'dev':
      await devCommand(flags);
      break;
    case 'start':
      await startCommand(flags);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

interface Flags {
  project: string;
  outDir: string;
  entry: string;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {
    project: './tsconfig.json',
    outDir: './.interactkit/generated',
    entry: './.interactkit/build/src/index.js',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if ((arg === '--project' || arg === '-p') && next) {
      flags.project = next;
      i++;
    } else if ((arg === '--outDir' || arg === '-o') && next) {
      flags.outDir = next;
      i++;
    } else if ((arg === '--entry' || arg === '-e') && next) {
      flags.entry = next;
      i++;
    }
  }

  return flags;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
