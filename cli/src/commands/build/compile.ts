import { resolve } from 'node:path';
import { mkdirSync, cpSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

/** Run TypeScript compilation and merge generated output into build. */
export function compile(cwd: string, buildDir: string) {
  console.log('▸ tsc');
  mkdirSync(buildDir, { recursive: true });
  try {
    execSync(`npx tsc --outDir "${buildDir}"`, { stdio: 'inherit', cwd });
  } catch {
    process.exit(1);
  }

  // Merge generated output into src output so rootDirs imports resolve at runtime
  const generatedBuildDir = resolve(buildDir, '.interactkit/generated');
  const srcBuildDir = resolve(buildDir, 'src');
  if (existsSync(generatedBuildDir) && existsSync(srcBuildDir)) {
    cpSync(generatedBuildDir, srcBuildDir, { recursive: true, force: true });
  }
}
