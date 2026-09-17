// Why: the share page is read by people without Orca, so it ships English defaults only instead
// of bundling every renderer locale catalog into the page script.
export function translate(
  _key: string,
  fallback: string,
  options?: Record<string, unknown>
): string {
  if (!options) {
    return fallback
  }
  return fallback.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const value = options[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : match
  })
}
