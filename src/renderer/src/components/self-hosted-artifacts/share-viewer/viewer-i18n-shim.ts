// Why: readers open share links without Orca, so the page ships only the catalog entries its own
// modules use (collected by build-artifact-share-viewer.mjs) and picks the browser's language.
declare const __ORCA_SHARE_VIEWER_MESSAGES__: Record<string, Record<string, string>>

const MESSAGES: Record<string, Record<string, string>> = typeof __ORCA_SHARE_VIEWER_MESSAGES__ ===
'object'
  ? __ORCA_SHARE_VIEWER_MESSAGES__
  : {}

/** Catalog for the first browser language Orca translates; Traditional Chinese goes to zh-Hant. */
function pickLanguage(languages: readonly string[]): { catalog: string; tag: string } {
  for (const tag of languages) {
    const lower = tag.toLowerCase()
    const traditional = /^zh-(hant|tw|hk|mo)/.test(lower)
    const candidates = traditional ? ['zh-Hant'] : [tag, lower.split('-')[0] ?? lower]
    const catalog = candidates.find((candidate) => candidate === 'en' || candidate in MESSAGES)
    if (catalog) {
      return { catalog, tag }
    }
  }
  return { catalog: 'en', tag: 'en-US' }
}

const LANGUAGE = pickLanguage(
  typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
)

export function translate(
  key: string,
  fallback: string,
  options?: Record<string, unknown>
): string {
  const template = MESSAGES[LANGUAGE.catalog]?.[key] ?? fallback
  if (!options) {
    return template
  }
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const value = options[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : match
  })
}

/** Dates and numbers follow the language the page's copy is shown in. */
export function getIntlLocale(): string {
  return LANGUAGE.tag
}

export function getShareViewerLanguage(): string {
  return LANGUAGE.catalog
}
