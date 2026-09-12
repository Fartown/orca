export const INTEGRATION_RELEASES_URL = 'https://github.com/Fartown/orca/releases'
const API_URL = 'https://api.github.com/repos/Fartown/orca/releases?per_page=30'
const TAG_PATTERN = /^integration-[1-9]\d*-([a-f0-9]{12})$/

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
}

export function integrationDownloadUrl(tag: string, name = ''): string {
  if (!TAG_PATTERN.test(tag) || (name && !/^[a-zA-Z0-9._-]+$/.test(name))) {
    throw new Error('Invalid integration release asset.')
  }
  return `${INTEGRATION_RELEASES_URL}/download/${tag}${name ? `/${name}` : ''}`
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
    typeof item.desktopVersion !== 'string' ||
    !/^\d+\.\d+\.\d+-local\.\d+\.[a-f0-9]{12}$/.test(item.desktopVersion) ||
    !item.desktopVersion.endsWith(item.sha.slice(0, 12)) ||
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
  return item as IntegrationRelease
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetcher(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Update check failed (HTTP ${response.status}).`)
    }
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchIntegrationRelease(
  platform: 'android' | 'mac',
  fetcher: typeof fetch = fetch
): Promise<IntegrationRelease> {
  const releases = await fetchJson(API_URL, fetcher)
  if (!Array.isArray(releases)) {
    throw new Error('Invalid GitHub release response.')
  }
  const required = [
    'build-info.json',
    ...(platform === 'android'
      ? ['orca-integration-android.apk']
      : ['latest-mac.yml', 'orca-integration-macos-arm64.zip', 'orca-integration-macos-x64.zip'])
  ]
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
  const latest = candidates.sort(
    (a, b) => Number(b.tag_name.split('-')[1]) - Number(a.tag_name.split('-')[1])
  )[0]
  if (!latest) {
    throw new Error('No complete integration update has been published yet.')
  }
  const release = parseIntegrationRelease(
    await fetchJson(integrationDownloadUrl(latest.tag_name, 'build-info.json'), fetcher),
    latest.tag_name
  )
  if (
    required
      .filter((name) => name.startsWith('orca-'))
      .some((name) => !release.assets.some((asset) => asset.name === name))
  ) {
    throw new Error('Integration update manifest is missing a package.')
  }
  return release
}
