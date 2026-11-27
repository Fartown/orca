import {
  hasInstalledReleaseBaseline,
  integrationChanges,
  integrationChangeSummary,
  integrationEngineeringChanges,
  isCandidateMetadataInstalledOrOlder,
  isReleaseInstalledOrOlder,
  MAX_AGGREGATED_RELEASES,
  mergeIntegrationReleaseChanges,
  parseAtomReleaseEntries,
  withFallbackEngineeringChanges,
  type IntegrationChange,
  type IntegrationReleaseQueryOptions
} from './integration-release-changes'

export {
  integrationChanges,
  integrationChangeSummary,
  integrationEngineeringChanges,
  type IntegrationChange,
  type IntegrationReleaseQueryOptions
}

export const INTEGRATION_RELEASES_URL = 'https://github.com/Fartown/orca/releases'
const API_URL = 'https://api.github.com/repos/Fartown/orca/releases?per_page=30'
const TAG_PATTERN = /^integration-[1-9]\d*-([a-f0-9]{12})$/
const LOCAL_DESKTOP_VERSION = /^\d+\.\d+\.\d+-local\.\d+\.([a-f0-9]{12})$/
const PREVIEW_DESKTOP_VERSION = /^\d+\.\d+\.\d+-preview\.[1-9]\d*$/
const ATOM_TAG_LINK =
  /<link\b[^>]*\bhref="https:\/\/github\.com\/Fartown\/orca\/releases\/tag\/(integration-[1-9]\d*-[a-f0-9]{12})"[^>]*>/g

export type IntegrationAsset = {
  name: string
  bytes: number
  sha256: string
}

export type IntegrationRelease = {
  tag: string
  sha: string
  desktopVersion: string
  androidVersion: string
  androidVersionCode: number
  assets: IntegrationAsset[]
  linuxAssets?: IntegrationAsset[]
  /** Unvalidated manifest list; read it through `integrationChanges`. */
  changes?: unknown
  /** Optional engineering-only fallback list; read through `integrationEngineeringChanges`. */
  engineeringChanges?: unknown
}

export function integrationDownloadUrl(tag: string, name = ''): string {
  if (!TAG_PATTERN.test(tag) || (name && !/^[a-zA-Z0-9._-]+$/.test(name))) {
    throw new Error('Invalid integration release asset.')
  }
  return `${INTEGRATION_RELEASES_URL}/download/${tag}${name ? `/${name}` : ''}`
}

export function isPreviewDesktopVersion(version: string): boolean {
  return PREVIEW_DESKTOP_VERSION.test(version)
}

// Builds before `-preview.N` versions carried the commit in the version itself.
function isDesktopVersionOf(version: unknown, sha: string): boolean {
  return (
    typeof version === 'string' &&
    (isPreviewDesktopVersion(version) ||
      version.match(LOCAL_DESKTOP_VERSION)?.[1] === sha.slice(0, 12))
  )
}

export function parseIntegrationRelease(value: unknown, tag: string): IntegrationRelease {
  const item = value as Partial<IntegrationRelease> & { schemaVersion?: number }
  if (
    !item ||
    item.schemaVersion !== 2 ||
    item.tag !== tag ||
    !TAG_PATTERN.test(tag) ||
    typeof item.sha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(item.sha) ||
    !tag.endsWith(item.sha.slice(0, 12)) ||
    !isDesktopVersionOf(item.desktopVersion, item.sha) ||
    typeof item.androidVersion !== 'string' ||
    !Number.isSafeInteger(item.androidVersionCode) ||
    item.androidVersionCode! <= 16 ||
    item.androidVersionCode! > 2100000000 ||
    !Array.isArray(item.assets) ||
    !item.assets.length
  ) {
    throw new Error('Invalid integration update manifest.')
  }
  const names = new Set<string>()
  for (const asset of item.assets) {
    if (
      !asset ||
      typeof asset.name !== 'string' ||
      names.has(asset.name) ||
      !/^orca-integration-(macos-(arm64|x64)\.(zip|dmg)|android\.apk)$/.test(asset.name) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes <= 0 ||
      asset.bytes > 2_000_000_000 ||
      typeof asset.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    ) {
      throw new Error('Invalid integration update asset.')
    }
    names.add(asset.name)
  }
  if (item.linuxAssets !== undefined) {
    if (!Array.isArray(item.linuxAssets) || !item.linuxAssets.length) {
      throw new Error('Invalid integration Linux assets.')
    }
    for (const asset of item.linuxAssets) {
      if (
        !asset ||
        asset.name !== 'orca-linux.AppImage' ||
        names.has(asset.name) ||
        !Number.isSafeInteger(asset.bytes) ||
        asset.bytes <= 0 ||
        asset.bytes > 2_000_000_000 ||
        typeof asset.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(asset.sha256)
      ) {
        throw new Error('Invalid integration Linux asset.')
      }
      names.add(asset.name)
    }
  }
  return item as IntegrationRelease
}

class UpdateHttpError extends Error {
  readonly status: number

  constructor(status: number, url: string) {
    const source = url === API_URL ? 'GitHub API' : new URL(url).pathname.split('/').at(-1)
    super(`Update check failed (HTTP ${status}; ${source}).`)
    this.status = status
  }
}

async function fetchReleaseData<T>(
  url: string,
  fetcher: typeof fetch,
  read: (response: Response) => Promise<T>,
  method = 'GET'
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetcher(url, { signal: controller.signal, method })
    if (!response.ok) {
      throw new UpdateHttpError(response.status, url)
    }
    return await read(response)
  } finally {
    clearTimeout(timeout)
  }
}

const fetchJson = (url: string, fetcher: typeof fetch): Promise<unknown> =>
  fetchReleaseData(url, fetcher, (response) => response.json())

async function readManifest(tag: string, fetcher: typeof fetch): Promise<IntegrationRelease> {
  return parseIntegrationRelease(
    await fetchJson(integrationDownloadUrl(tag, 'build-info.json'), fetcher),
    tag
  )
}

function hasPackages(release: IntegrationRelease, required: string[]): boolean {
  const assets = [...release.assets, ...(release.linuxAssets ?? [])]
  return required
    .filter((name) => name.startsWith('orca-'))
    .every((name) => assets.some((asset) => asset.name === name))
}

async function collectNewerReleases(
  latest: IntegrationRelease,
  olderCandidates: readonly { tag: string; title?: unknown; notes?: unknown }[],
  required: string[],
  fetcher: typeof fetch,
  options?: IntegrationReleaseQueryOptions
): Promise<IntegrationRelease> {
  if (!hasInstalledReleaseBaseline(options) || isReleaseInstalledOrOlder(latest, options)) {
    return latest
  }
  const olderNewer: IntegrationRelease[] = []
  for (const candidate of olderCandidates.slice(0, MAX_AGGREGATED_RELEASES - 1)) {
    if (isCandidateMetadataInstalledOrOlder(candidate, options)) {
      break
    }
    try {
      const release = await readManifest(candidate.tag, fetcher)
      if (isReleaseInstalledOrOlder(release, options)) {
        break
      }
      if (hasPackages(release, required)) {
        olderNewer.push(withFallbackEngineeringChanges(release, candidate.notes))
      }
    } catch {
      break
    }
  }
  return mergeIntegrationReleaseChanges(latest, olderNewer)
}

async function fetchPublicRelease(
  required: string[],
  fetcher: typeof fetch,
  options?: IntegrationReleaseQueryOptions
) {
  const body = await fetchReleaseData(`${INTEGRATION_RELEASES_URL}.atom`, fetcher, (response) =>
    response.text()
  )
  const atomEntries = parseAtomReleaseEntries(body)
  const allTags = [...new Set([...body.matchAll(ATOM_TAG_LINK)].map((match) => match[1]))].sort(
    (a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])
  )
  // The publisher exposes releases only after all assets exist; still reject partial uploads.
  for (const [index, tag] of allTags.slice(0, 3).entries()) {
    try {
      const release = await readManifest(tag, fetcher)
      if (!hasPackages(release, required)) {
        continue
      }
      await Promise.all(
        required
          .filter((name) => name !== 'build-info.json')
          .map((name) =>
            fetchReleaseData(
              integrationDownloadUrl(tag, name),
              fetcher,
              async () => undefined,
              'HEAD'
            )
          )
      )
      const latest = withFallbackEngineeringChanges(release, atomEntries.get(tag)?.content)
      const olderCandidates = allTags.slice(index + 1).map((olderTag) => ({
        tag: olderTag,
        title: atomEntries.get(olderTag)?.title,
        notes: atomEntries.get(olderTag)?.content
      }))
      return await collectNewerReleases(latest, olderCandidates, required, fetcher, options)
    } catch (error) {
      if (!(error instanceof UpdateHttpError && error.status === 404)) {
        throw error
      }
    }
  }
  throw new Error('No complete integration update has been published yet.')
}

export async function fetchIntegrationRelease(
  platform: 'android' | 'mac' | 'linux',
  fetcher: typeof fetch = fetch,
  options?: IntegrationReleaseQueryOptions
): Promise<IntegrationRelease> {
  const required = [
    'build-info.json',
    ...(platform === 'android'
      ? ['orca-integration-android.apk']
      : platform === 'linux'
        ? ['latest-linux.yml', 'orca-linux.AppImage']
        : ['latest-mac.yml', 'orca-integration-macos-arm64.zip'])
  ]
  let releases: unknown
  try {
    releases = await fetchJson(API_URL, fetcher)
  } catch (error) {
    if (error instanceof UpdateHttpError && [403, 429].includes(error.status)) {
      return fetchPublicRelease(required, fetcher, options)
    }
    throw error
  }
  if (!Array.isArray(releases)) {
    throw new Error('Invalid GitHub release response.')
  }
  const candidates = releases.filter(
    (release) =>
      release &&
      !release.draft &&
      release.prerelease &&
      typeof release.tag_name === 'string' &&
      TAG_PATTERN.test(release.tag_name) &&
      Array.isArray(release.assets) &&
      required.every((name) =>
        release.assets.some((asset: { name?: unknown }) => asset?.name === name)
      )
  )
  // GitHub can order releases by the target commit's date rather than the build run.
  const sorted = candidates.sort(
    (a, b) => Number(b.tag_name.split('-')[1]) - Number(a.tag_name.split('-')[1])
  )
  const latestCandidate = sorted[0]
  if (!latestCandidate) {
    throw new Error('No complete integration update has been published yet.')
  }
  const release = withFallbackEngineeringChanges(
    await readManifest(latestCandidate.tag_name, fetcher),
    latestCandidate.body
  )
  if (!hasPackages(release, required)) {
    throw new Error('Integration update manifest is missing a package.')
  }
  const olderCandidates = sorted.slice(1).map((candidate) => ({
    tag: String(candidate.tag_name),
    title: candidate.name,
    notes: candidate.body
  }))
  return collectNewerReleases(release, olderCandidates, required, fetcher, options)
}
