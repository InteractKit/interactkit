#!/usr/bin/env node

import { Command } from 'commander';
import { buildCommand } from './commands/build.js';
import { devCommand } from './commands/dev.js';
import { startCommand } from './commands/start.js';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';

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
  .action(async (name: string, opts: { llm?: boolean; attach?: string }) => {
    await addCommand(name, opts);
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
