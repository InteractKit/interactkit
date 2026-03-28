import { resolve } from 'node:path';
import { cpSync, rmSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { Project } from 'ts-morph';
import { calculatePaths } from './path-calculator.js';
import { injectPaths } from './source-injector.js';
import type { ParsedEntity } from '@/codegen/parser/types/parsed-entity.js';

/**
 * Codegen mutator: copies user source to staging, injects @__Path decorators,
 * returns the staging directory path.
 *
 * User source is never modified — all mutations happen on the staging copy.
 */
export function mutate(
  rootEntity: ParsedEntity,
  allEntities: ParsedEntity[],
  cwd: string,
  tsconfigPath: string,
): { stagingDir: string; cleanup: () => void } {
  const stagingDir = resolve(cwd, '.interactkit/staging');

  // Clean previous staging
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  // Copy source + generated + tsconfig to staging
  cpSync(resolve(cwd, 'src'), resolve(stagingDir, 'src'), { recursive: true });
  cpSync(resolve(cwd, '.interactkit/generated'), resolve(stagingDir, '.interactkit/generated'), { recursive: true });
  cpSync(resolve(cwd, tsconfigPath), resolve(stagingDir, 'tsconfig.json'));

  // Symlink node_modules + package.json for module resolution (fast, no copy)
  const nmSrc = resolve(cwd, 'node_modules');
  const nmDst = resolve(stagingDir, 'node_modules');
  if (existsSync(nmSrc) && !existsSync(nmDst)) {
    symlinkSync(nmSrc, nmDst, 'junction');
  }
  try { cpSync(resolve(cwd, 'package.json'), resolve(stagingDir, 'package.json')); } catch {}

  // Calculate path IDs from the parsed entity tree
  const pathMap = calculatePaths(rootEntity);

  console.log(`  mutator: ${pathMap.size} path IDs calculated`);

  // Open staging project with ts-morph and inject mutations
  const stagingProject = new Project({
    tsConfigFilePath: resolve(stagingDir, 'tsconfig.json'),
  });

  injectPaths(stagingProject, pathMap);

  console.log(`  mutator: @__Path injected into staging`);

  return {
    stagingDir,
    cleanup: () => {
      rmSync(stagingDir, { recursive: true, force: true });
    },
  };
}
