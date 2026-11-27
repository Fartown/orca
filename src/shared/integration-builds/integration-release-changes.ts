const LOCAL_DESKTOP_VERSION = /^\d+\.\d+\.\d+-local\.\d+\.([a-f0-9]{12})$/
const PREVIEW_DESKTOP_VERSION = /^\d+\.\d+\.\d+-preview\.([1-9]\d*)$/
const RELEASE_TITLE_PREVIEW = /^Orca \d+\.\d+\.\d+-preview\.([1-9]\d*)$/
const MARKDOWN_ENGINEERING_SECTION = /<summary>工程改动[^<\n]*<\/summary>([\s\S]*?)<\/details>/
const ATOM_ENGINEERING_SECTION =
  /&lt;summary&gt;工程改动[\s\S]*?&lt;\/summary&gt;([\s\S]*?)&lt;\/details&gt;/
const ATOM_LIST_ITEM = /&lt;li&gt;([\s\S]*?)&lt;\/li&gt;/g
const ATOM_ENTRY = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g
const ATOM_ENTRY_TAG =
  /<link\b[^>]*\bhref="https:\/\/github\.com\/Fartown\/orca\/releases\/tag\/(integration-[1-9]\d*-[a-f0-9]{12})"[^>]*>/
const ATOM_ENTRY_TITLE = /<title\b[^>]*>([^<]*)<\/title>/
const ATOM_ENTRY_CONTENT = /<content\b[^>]*>([\s\S]*?)<\/content>/

const MAX_MANIFEST_CHANGES = 100
const MAX_CHANGE_TITLE = 300
const SHOWN_CHANGES = 3
export const MAX_AGGREGATED_RELEASES = 10

/** A pull request merged into the integration branch, or a direct commit without `number`. */
export type IntegrationChange = {
  number?: number
  title: string
}

export type IntegrationReleaseQueryOptions = {
  installedDesktopVersion?: string | null
  installedAndroidVersionCode?: number | null
}

type ChangeCarrier = {
  changes?: unknown
  engineeringChanges?: unknown
}

type InstalledCheckTarget = {
  sha: string
  desktopVersion: string
  androidVersionCode: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function clampChangeTitle(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.length > MAX_CHANGE_TITLE ? `${trimmed.slice(0, MAX_CHANGE_TITLE - 1)}…` : trimmed
}

// Display-only, so a malformed list reads as empty instead of rejecting the update.
export function parseIntegrationChangeList(value: unknown): IntegrationChange[] {
  if (!Array.isArray(value) || value.length > MAX_MANIFEST_CHANGES) {
    return []
  }
  const changes: IntegrationChange[] = []
  for (const item of value) {
    if (!isRecord(item)) {
      return []
    }
    const title = item.title
    const number = item.number
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > MAX_CHANGE_TITLE ||
      (number !== undefined &&
        !(typeof number === 'number' && Number.isSafeInteger(number) && number > 0))
    ) {
      return []
    }
    changes.push(number === undefined ? { title: title.trim() } : { number, title: title.trim() })
  }
  return changes
}

export function integrationChanges(release: ChangeCarrier): IntegrationChange[] {
  return parseIntegrationChangeList(release.changes)
}

export function integrationEngineeringChanges(release: ChangeCarrier): IntegrationChange[] {
  return parseIntegrationChangeList(release.engineeringChanges)
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function extractEngineeringChangesFromNotes(notes: unknown): IntegrationChange[] {
  if (typeof notes !== 'string' || !notes) {
    return []
  }
  const markdownMatch = notes.match(MARKDOWN_ENGINEERING_SECTION)
  if (markdownMatch) {
    return markdownMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => clampChangeTitle(line.slice(2)))
      .filter(Boolean)
      .slice(0, MAX_MANIFEST_CHANGES)
      .map((title) => ({ title }))
  }
  const atomMatch = notes.match(ATOM_ENGINEERING_SECTION)
  if (!atomMatch) {
    return []
  }
  const items: IntegrationChange[] = []
  for (const itemMatch of atomMatch[1].matchAll(ATOM_LIST_ITEM)) {
    const stripped = decodeHtmlEntities(itemMatch[1].replace(/&lt;[\s\S]*?&gt;/g, '')).replace(
      /\s+/g,
      ' '
    )
    const title = clampChangeTitle(stripped)
    if (title) {
      items.push({ title })
    }
    if (items.length >= MAX_MANIFEST_CHANGES) {
      break
    }
  }
  return items
}

export function withFallbackEngineeringChanges<T extends ChangeCarrier>(
  release: T,
  notes?: unknown
): T {
  if (integrationEngineeringChanges(release).length > 0) {
    return release
  }
  const extracted = extractEngineeringChangesFromNotes(notes)
  return extracted.length > 0 ? { ...release, engineeringChanges: extracted } : release
}

export function parseAtomReleaseEntries(
  atomXml: string
): Map<string, { title?: string; content?: string }> {
  const entries = new Map<string, { title?: string; content?: string }>()
  for (const match of atomXml.matchAll(ATOM_ENTRY)) {
    const block = match[1]
    const tag = block.match(ATOM_ENTRY_TAG)?.[1]
    if (!tag || entries.has(tag)) {
      continue
    }
    const title = block.match(ATOM_ENTRY_TITLE)?.[1]?.trim()
    const content = block.match(ATOM_ENTRY_CONTENT)?.[1]
    entries.set(tag, { title, content })
  }
  return entries
}

function previewNumberOf(version: string | null | undefined): number | null {
  if (!version) {
    return null
  }
  const match = version.match(PREVIEW_DESKTOP_VERSION)
  return match ? Number(match[1]) : null
}

function localSha12Of(version: string | null | undefined): string | null {
  if (!version) {
    return null
  }
  return version.match(LOCAL_DESKTOP_VERSION)?.[1] ?? null
}

function previewNumberFromTitle(title: unknown): number | null {
  if (typeof title !== 'string') {
    return null
  }
  const match = title.trim().match(RELEASE_TITLE_PREVIEW)
  return match ? Number(match[1]) : null
}

export function hasInstalledReleaseBaseline(options?: IntegrationReleaseQueryOptions): boolean {
  if (
    typeof options?.installedAndroidVersionCode === 'number' &&
    Number.isSafeInteger(options.installedAndroidVersionCode) &&
    options.installedAndroidVersionCode > 0
  ) {
    return true
  }
  const desktop = options?.installedDesktopVersion
  return previewNumberOf(desktop) !== null || localSha12Of(desktop) !== null
}

export function isCandidateMetadataInstalledOrOlder(
  candidate: { tag: string; title?: unknown },
  options?: IntegrationReleaseQueryOptions
): boolean {
  const desktop = options?.installedDesktopVersion
  const sha12 = localSha12Of(desktop)
  if (sha12 && candidate.tag.endsWith(`-${sha12}`)) {
    return true
  }
  const installedPreview = previewNumberOf(desktop)
  const candidatePreview = previewNumberFromTitle(candidate.title)
  return (
    installedPreview !== null && candidatePreview !== null && candidatePreview <= installedPreview
  )
}

export function isReleaseInstalledOrOlder(
  release: InstalledCheckTarget,
  options?: IntegrationReleaseQueryOptions
): boolean {
  const versionCode = options?.installedAndroidVersionCode
  if (typeof versionCode === 'number' && Number.isSafeInteger(versionCode) && versionCode > 0) {
    if (release.androidVersionCode <= versionCode) {
      return true
    }
  }
  const desktop = options?.installedDesktopVersion
  if (!desktop) {
    return false
  }
  if (release.desktopVersion === desktop) {
    return true
  }
  const sha12 = localSha12Of(desktop)
  if (sha12 && release.sha.startsWith(sha12)) {
    return true
  }
  const installedPreview = previewNumberOf(desktop)
  const releasePreview = previewNumberOf(release.desktopVersion)
  return installedPreview !== null && releasePreview !== null && releasePreview <= installedPreview
}

function mergeUniqueChanges(lists: readonly IntegrationChange[][]): IntegrationChange[] {
  const seen = new Set<string>()
  const merged: IntegrationChange[] = []
  for (const list of lists) {
    for (const change of list) {
      const key = change.number !== undefined ? `pr:${change.number}` : `title:${change.title}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      merged.push(change)
      if (merged.length >= MAX_MANIFEST_CHANGES) {
        return merged
      }
    }
  }
  return merged
}

export function mergeIntegrationReleaseChanges<T extends ChangeCarrier>(
  latest: T,
  olderNewerReleases: readonly ChangeCarrier[]
): T {
  const span = [latest, ...olderNewerReleases]
  const changes = mergeUniqueChanges(span.map(integrationChanges))
  const engineeringChanges = mergeUniqueChanges(span.map(integrationEngineeringChanges))
  return {
    ...latest,
    ...(changes.length > 0 ? { changes } : {}),
    ...(engineeringChanges.length > 0 ? { engineeringChanges } : {})
  }
}

export function integrationChangeSummary(release: ChangeCarrier): string | null {
  const visible = integrationChanges(release)
  const changes = visible.length > 0 ? visible : integrationEngineeringChanges(release)
  if (changes.length === 0) {
    return null
  }
  const shown = changes
    .slice(0, SHOWN_CHANGES)
    .map((change) => change.title)
    .join(' · ')
  return changes.length > SHOWN_CHANGES ? `${shown} +${changes.length - SHOWN_CHANGES}` : shown
}
