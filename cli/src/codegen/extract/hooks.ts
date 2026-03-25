import { ClassDeclaration, MethodDeclaration, Project } from 'ts-morph';
import type { HookInfo } from '../types.js';
import { extractPackageName } from '../utils.js';

export function getHookMethodNames(cls: ClassDeclaration): Set<string> {
  const names = new Set<string>();
  for (const method of cls.getMethods()) {
    if (method.getDecorator('Hook')) {
      names.add(method.getName());
    }
  }
  return names;
}

export function extractHook(method: MethodDeclaration, project: Project): HookInfo | null {
  const params = method.getParameters();
  if (params.length === 0) return null;

  const paramType = params[0].getType();
  const symbol = paramType.getSymbol() ?? paramType.getAliasSymbol();
  if (!symbol) return null;

  const hookTypeName = symbol.getName();
  const declarations = symbol.getDeclarations();
  const declFile = declarations[0]?.getSourceFile().getFilePath() ?? '';
  const sourcePackage = extractPackageName(declFile);

  // Extract generic config from type arguments
  const typeArgs = paramType.getTypeArguments?.() ?? paramType.getAliasTypeArguments?.() ?? [];
  let genericConfig: string | undefined;
  if (typeArgs.length > 0) {
    genericConfig = typeArgs[0].getText();
  }

  // Find HookRunner<T> in same package
  let runnerExport: string | undefined;
  if (sourcePackage) {
    runnerExport = findHookRunner(project, sourcePackage, hookTypeName);
  }

  return {
    methodName: method.getName(),
    hookTypeName,
    genericConfig,
    sourcePackage: sourcePackage ?? undefined,
    runnerExport,
  };
}

function findHookRunner(
  project: Project,
  packageName: string,
  hookTypeName: string,
): string | undefined {
  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getFilePath().includes(`node_modules/${packageName}`)) continue;

    for (const cls of sourceFile.getClasses()) {
      for (const impl of cls.getImplements()) {
        const exprText = impl.getExpression().getText();
        if (exprText !== 'HookRunner') continue;

        const typeArgs = impl.getTypeArguments();
        if (typeArgs.length > 0 && typeArgs[0].getText() === hookTypeName) {
          return cls.getName() ?? undefined;
        }
      }
    }
  }
  return undefined;
}
