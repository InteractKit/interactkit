import { ClassDeclaration, MethodDeclaration, Node } from 'ts-morph';
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

export function extractHook(method: MethodDeclaration): HookInfo | null {
  const decorator = method.getDecorator('Hook');
  if (!decorator) return null;

  // Extract runner from decorator argument: @Hook(Init.Runner()) or @Hook(SomeRunner({ key: val }))
  const args = decorator.getArguments();
  let runnerExport: string | undefined;
  let runnerSourcePackage: string | undefined;

  if (args.length > 0) {
    const arg = args[0];
    // Resolve the call expression to find the Runner function's source
    const argType = arg.getType();
    const symbol = argType.getSymbol() ?? argType.getAliasSymbol();
    if (symbol) {
      const decls = symbol.getDeclarations();
      if (decls.length > 0) {
        const declFile = decls[0].getSourceFile().getFilePath();
        runnerSourcePackage = extractPackageName(declFile) ?? undefined;
      }
    }
    // Store the decorator argument text as the runner reference
    runnerExport = arg.getText();
  }

  // Extract input type from method parameter
  const params = method.getParameters();
  let hookTypeName: string | undefined;
  let sourcePackage: string | undefined;

  if (params.length > 0) {
    const paramType = params[0].getType();
    const paramSymbol = paramType.getSymbol() ?? paramType.getAliasSymbol();
    if (paramSymbol) {
      hookTypeName = paramSymbol.getName();
      const declarations = paramSymbol.getDeclarations();
      const declFile = declarations[0]?.getSourceFile().getFilePath() ?? '';
      sourcePackage = extractPackageName(declFile) ?? undefined;
    }
  }

  // Check if this hook's Runner declares inProcess: true
  // Resolve the Runner function source and check its body for inProcess: true
  let inProcess = false;
  if (args.length > 0) {
    const arg = args[0];
    if (Node.isCallExpression(arg)) {
      const fnSym = arg.getExpression().getType().getSymbol();
      const decls = fnSym?.getDeclarations() ?? [];
      for (const decl of decls) {
        if (decl.getText().includes('inProcess: true')) {
          inProcess = true;
          break;
        }
      }
    }
  }

  return {
    methodName: method.getName(),
    hookTypeName: hookTypeName ?? 'unknown',
    runnerExport,
    sourcePackage: runnerSourcePackage ?? sourcePackage,
    inProcess,
  };
}
