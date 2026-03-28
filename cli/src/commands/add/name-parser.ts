/** Parse a dot-separated name like "researcher.Browser" into path segments and class name. */
export function parseName(input: string) {
  const parts = input.split('.');
  const rawName = parts.pop()!;
  const className = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const fileName = rawName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const segments = parts.map(s => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase());
  const entityType = fileName;
  return { segments, className, fileName, entityType };
}
