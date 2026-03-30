import { ClassDeclaration, MethodDeclaration, Node } from 'ts-morph';
import { parseType } from '@/codegen/utils/parse-type.js';
import { extractPackageName } from '@/codegen/utils/extract-package-name.js';
import type { ParsedHook } from '../types/parsed-hook.js';

/**
 * Scan a class for @Hook-decorated methods and return their names.
 */
export function getHookMethodNames(cls: ClassDeclaration): Set<string> {
  const names = new Set<string>();
  for (const method of cls.getMethods()) {
    if (method.getDecorator('Hook')) {
      names.add(method.getName());
    }
  }
  return names;
}

/**
 * Parse a @Hook-decorated method into a rich ParsedHook.
 * Extracts runner reference, source package, input type, and inProcess flag.
 */
export function parseHook(method: MethodDeclaration): ParsedHook | null {
  const decorator = method.getDecorator('Hook');
  if (!decorator) return null;

  // Extract runner from decorator argument: @Hook(Init.Runner())
  const args = decorator.getArguments();
  let runnerExport: string | undefined;
  let runnerSourcePackage: string | undefined;

  if (args.length > 0) {
    const arg = args[0];
    runnerExport = arg.getText();

    // Resolve source package from the entity's import declarations first
    // e.g. import { HttpRequest } from '@interactkit/http' → '@interactkit/http'
    const ns = runnerExport.split('.')[0];
    const sourceFile = method.getSourceFile();
    for (const imp of sourceFile.getImportDeclarations()) {
      if (imp.getNamedImports().some(n => n.getName() === ns)) {
        runnerSourcePackage = imp.getModuleSpecifierValue();
        break;
      }
    }

    // Fallback: try type declaration file
    if (!runnerSourcePackage) {
      const argType = arg.getType();
      const symbol = argType.getSymbol() ?? argType.getAliasSymbol();
      if (symbol) {
        const decls = symbol.getDeclarations();
        if (decls.length > 0) {
          const declFile = decls[0].getSourceFile().getFilePath();
          runnerSourcePackage = extractPackageName(declFile) ?? undefined;
        }
      }
    }
  }

  // Extract input type from method parameter
  const params = method.getParameters();
  let hookTypeName: string | undefined;
  let sourcePackage: string | undefined;
  let inputType;
  let isRemoteInput = false;

  if (params.length > 0) {
    // Check raw type text for Remote<T> wrapping
    const paramTypeText = params[0].getTypeNode()?.getText() ?? '';
    const remoteMatch = paramTypeText.match(/^Remote<(.+)>$/);
    isRemoteInput = !!remoteMatch;
    const innerTypeText = remoteMatch ? remoteMatch[1] : paramTypeText;

    const paramType = params[0].getType();
    inputType = parseType(paramType);

    // For Remote<T>, use text-based resolution (mapped types lose symbol info)
    if (isRemoteInput) {
      // innerTypeText is e.g. "HttpRequest.Input" → hookTypeName = "Input"
      const parts = innerTypeText.split('.');
      hookTypeName = parts[parts.length - 1];
    } else {
      const paramSymbol = paramType.getSymbol() ?? paramType.getAliasSymbol();
      if (paramSymbol) {
        hookTypeName = paramSymbol.getName();
        const declarations = paramSymbol.getDeclarations();
        const declFile = declarations[0]?.getSourceFile().getFilePath() ?? '';
        sourcePackage = extractPackageName(declFile) ?? undefined;
      }
    }
  }

  // Check if this hook's Runner declares inProcess: true
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
    isRemoteInput,
    inputType,
  };
}
