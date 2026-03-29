import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { runCodegen } from './codegen.js';
import { generateEntry } from './generate-entry.js';
import { generateHooks } from './generate-hooks.js';
import { generateUnits } from './generate-units.js';
import { compile } from './compile.js';
import { generateDocker } from './generate-docker.js';
import { mutate } from '@/codegen/mutator/index.js';
import { resolveRootFromConfig } from './resolve-root.js';

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

  // Resolve root: --root flag takes priority, then interactkit.config.ts root field
  const root = flags.root ?? resolveRootFromConfig(cwd, projectPath);

  // Step 1: Parse + emit (type-registry, entity-tree, deployment)
  const rootClassName = root ? root.slice(root.lastIndexOf(':') + 1) : undefined;
  const entities = runCodegen(projectPath, generatedDir, rootClassName);
  const rootEntity = rootClassName ? entities.find(e => e.className === rootClassName) : entities[0];

  // Copy interactkit.config.ts into generated dir, stripping root import + field
  // (the generated _entry.ts handles the root class import separately)
  const configSrc = resolve(cwd, 'interactkit.config.ts');
  if (existsSync(configSrc)) {
    let configContent = readFileSync(configSrc, 'utf-8');
    // Remove lines importing the root class (from ./src/...)
    configContent = configContent.replace(/^import\s*\{[^}]*\}\s*from\s*['"]\.\/src\/[^'"]*['"];?\s*\n?/gm, '');
    // Remove root: ClassName from the config object
    configContent = configContent.replace(/\s*root\s*:\s*[A-Z][A-Za-z0-9_]*\s*,?/g, '');
    writeFileSync(resolve(generatedDir, 'interactkit.config.ts'), configContent);
  }

  // Step 2: Generate entrypoints into .interactkit/generated/
  generateEntry(generatedDir, root, dev);
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
  if (entities.length > 0 && root) {
    generateDocker(entities, generatedDir);
  }

  console.log('▸ done');
}
