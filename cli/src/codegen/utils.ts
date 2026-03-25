/** Extract a string property value from an object literal text like `{ type: "foo" }` */
export function extractStringProp(text: string, key: string): string | undefined {
  const regex = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`);
  const match = text.match(regex);
  return match?.[1];
}

/** Extract an identifier property value from object literal text, e.g. `{ pubsub: InProcessBusAdapter }` → "InProcessBusAdapter" */
export function extractIdentProp(text: string, key: string): string | undefined {
  const regex = new RegExp(`${key}\\s*:\\s*([A-Za-z_$][A-Za-z0-9_$]*)`);
  const match = text.match(regex);
  return match?.[1];
}

/** Extract npm package name from a file path (undefined if not in node_modules) */
export function extractPackageName(filePath: string): string | null {
  const nmIndex = filePath.lastIndexOf('node_modules/');
  if (nmIndex === -1) return null;

  const rest = filePath.slice(nmIndex + 'node_modules/'.length);
  if (rest.startsWith('@')) {
    const parts = rest.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return rest.split('/')[0] ?? null;
}
