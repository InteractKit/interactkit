import { resolve } from 'node:path';
import { runCodegen } from './codegen.js';
import { generateEntry } from './generate-entry.js';
import { generateHooks } from './generate-hooks.js';
import { generateUnits } from './generate-units.js';
import { compile } from './compile.js';
import { generateDocker } from './generate-docker.js';
import { mutate } from '@/codegen/mutator/index.js';

export interface BuildFlags {
  project: string;
  outDir: string;
  root?: string;
  dev?: boolean;
}

export async function buildCommand(flags: BuildFlags) {
  const cwd = process.cwd();
  const projectPath = resolve(cwd, flags.project);
  const generatedDir = resolve(cwd, '.interactkit/generated');
  const buildDir = resolve(cwd, '.interactkit/build');
  const dev = flags.dev ?? false;

  // Step 1: Parse + emit (type-registry, entity-tree, deployment)
  const rootClassName = flags.root ? flags.root.slice(flags.root.lastIndexOf(':') + 1) : undefined;
  const entities = runCodegen(projectPath, generatedDir, rootClassName);
  const rootEntity = rootClassName ? entities.find(e => e.className === rootClassName) : entities[0];

  // Step 2: Generate entrypoints into .interactkit/generated/
  generateEntry(generatedDir, flags.root, dev);
  generateHooks(entities, generatedDir);
  generateUnits(entities, generatedDir, dev, rootEntity);

  // Step 3: Run mutator (copy src to staging, inject @__Path + async transforms)
  if (rootEntity && entities.length > 0) {
    console.log('▸ mutator');
    const { stagingDir, cleanup } = mutate(rootEntity, entities, cwd, flags.project);

    // Step 4: Compile from staging (mutated source)
    compile(stagingDir, buildDir);
    cleanup();
  } else {
    // No entities — compile from original source
    compile(cwd, buildDir);
  }

  // Step 5: Docker
  if (entities.length > 0 && flags.root) {
    generateDocker(entities, generatedDir);
  }

  console.log('▸ done');
}
