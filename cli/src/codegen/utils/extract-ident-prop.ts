/** Extract an identifier property value from object literal text, e.g. `{ pubsub: InProcessBusAdapter }` → "InProcessBusAdapter" */
export function extractIdentProp(text: string, key: string): string | undefined {
  const regex = new RegExp(`${key}\\s*:\\s*([A-Za-z_$][A-Za-z0-9_$]*)`);
  const match = text.match(regex);
  return match?.[1];
}
