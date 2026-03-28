/** Extract a string property value from an object literal text like `{ type: "foo" }` */
export function extractStringProp(text: string, key: string): string | undefined {
  const regex = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`);
  const match = text.match(regex);
  return match?.[1];
}
