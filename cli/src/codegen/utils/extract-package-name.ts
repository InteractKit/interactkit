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
