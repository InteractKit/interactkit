import { Project } from 'ts-morph';

/**
 * Inject @__Path decorators into a staging copy of the source files.
 * Also strips Remote<T> → T so that TypeScript emits correct design:type metadata.
 *
 * Remote<T> is a user-facing type for compile-time safety.
 * At build time we unwrap it so the runtime sees the real class.
 */
export function injectPaths(project: Project, pathMap: Map<string, string>): void {
  // Group paths by class name
  const byClass = new Map<string, Map<string, string>>();
  for (const [key, pathId] of pathMap) {
    const [className, propName] = key.split('#');
    if (!byClass.has(className)) byClass.set(className, new Map());
    byClass.get(className)!.set(propName, pathId);
  }

  const filesNeedingImport = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const className = cls.getName();
      if (!className || !byClass.has(className)) continue;

      const propPaths = byClass.get(className)!;

      // Inject @__Path on properties + strip Remote<T>
      for (const prop of cls.getProperties()) {
        const pathId = propPaths.get(prop.getName());
        if (!pathId) continue;

        prop.addDecorator({ name: '__Path', arguments: [`'${pathId}'`] });
        filesNeedingImport.add(sourceFile.getFilePath());

        // Strip Remote<T> → T so design:type emits the real class
        // Also replace `!` with `= {} as T` so the property has a value at runtime
        const typeNode = prop.getTypeNode();
        if (typeNode) {
          const text = typeNode.getText();
          const match = text.match(/^Remote<(.+)>$/);
          if (match) {
            const innerType = match[1];
            prop.setType(innerType);
            if (prop.hasExclamationToken()) {
              prop.setHasExclamationToken(false);
              prop.setInitializer(`{} as any`);
            }
          }
        }
      }

      // Inject @__Path on methods
      for (const method of cls.getMethods()) {
        const pathId = propPaths.get(method.getName());
        if (!pathId) continue;

        method.addDecorator({ name: '__Path', arguments: [`'${pathId}'`] });
        filesNeedingImport.add(sourceFile.getFilePath());
      }
    }
  }

  // Add imports to files that need them
  for (const filePath of filesNeedingImport) {
    const sourceFile = project.getSourceFileOrThrow(filePath);

    const hasPathImport = sourceFile.getImportDeclarations().some(d =>
      d.getNamedImports().some(n => n.getName() === '__Path')
    );
    if (!hasPathImport) {
      const sdkImport = sourceFile.getImportDeclarations().find(d =>
        d.getModuleSpecifierValue() === '@interactkit/sdk'
      );
      if (sdkImport) {
        sdkImport.addNamedImport('__Path');
      } else {
        sourceFile.addImportDeclaration({
          moduleSpecifier: '@interactkit/sdk',
          namedImports: ['__Path'],
        });
      }
    }
  }

  project.saveSync();
}
