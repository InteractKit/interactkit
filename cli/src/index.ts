#!/usr/bin/env node

import { Command } from 'commander';
import { buildCommand } from './commands/build/index.js';
import { devCommand } from './commands/dev/index.js';
import { startCommand } from './commands/start/index.js';
import { initCommand } from './commands/init/index.js';
import { addCommand } from './commands/add/index.js';
import { attachCommand } from './commands/attach/index.js';

const program = new Command();

program
  .name('interactkit')
  .description('CLI for InteractKit projects')
  .version('0.1.0');

program
  .command('init <name>')
  .description('Create a new InteractKit project')
  .action(async (name: string) => {
    await initCommand(name);
  });

program
  .command('add <name>')
  .description('Generate an entity file (use dots for nesting: researcher.Browser)')
  .option('--llm', 'Generate an LLM entity extending LLMEntity')
  .option('--attach <parent>', 'Auto-add as @Component to a parent entity')
  .option('--mcp-stdio <cmd>', 'Generate entity from MCP server via stdio')
  .option('--mcp-http <url>', 'Generate entity from MCP server via HTTP')
  .option('--mcp-header <key=value>', 'Add header for MCP connection (repeatable)', (v: string, acc: string[]) => [...acc, v], [])
  .option('--mcp-env <key=value>', 'Add env var for stdio MCP server (repeatable)', (v: string, acc: string[]) => [...acc, v], [])
  .option('--detached', 'Mark entity as detached (uses remote pubsub from config)')
  .action(async (name: string, opts) => {
    await addCommand(name, opts);
  });

program
  .command('attach <child> <parent>')
  .description('Attach an entity to a parent as @Component or @Ref (auto-infers Remote<T>)')
  .option('--ref', 'Attach as @Ref instead of @Component')
  .action(async (child: string, parent: string, opts) => {
    await attachCommand(child, parent, opts);
  });

program
  .command('build')
  .description('Run codegen + TypeScript compilation')
  .option('-p, --project <path>', 'Path to tsconfig.json', './tsconfig.json')
  .option('-o, --outDir <path>', 'Codegen output directory', './.interactkit/generated')
  .option('-r, --root <path:Export>', 'Root entity file and export (e.g. src/entities/agent:Agent)')
  .action(async (opts) => {
    await buildCommand({ project: opts.project, outDir: opts.outDir, root: opts.root });
  });

program
  .command('dev')
  .description('Run codegen + build in watch mode')
  .option('-p, --project <path>', 'Path to tsconfig.json', './tsconfig.json')
  .option('-o, --outDir <path>', 'Codegen output directory', './.interactkit/generated')
  .option('-r, --root <path:Export>', 'Root entity file and export (e.g. src/entities/agent:Agent)')
  .action(async (opts) => {
    await devCommand({ project: opts.project, outDir: opts.outDir, root: opts.root });
  });

program
  .command('start')
  .description('Start the built application')
  .action(async () => {
    await startCommand();
  });

program.parse();
