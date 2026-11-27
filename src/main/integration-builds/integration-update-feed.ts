import { app, net } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import { linuxAppImageUpdateUnavailableMessage } from './linux-appimage-update-availability'
import {
  fetchIntegrationRelease,
  integrationChangeSummary,
  integrationDownloadUrl,
  INTEGRATION_RELEASES_URL,
  isPreviewDesktopVersion,
  type IntegrationRelease
} from '../../shared/integration-builds/release-catalog'

let resolvedRelease: IntegrationRelease | null = null

export function integrationChangelog(version: string) {
  const release = resolvedRelease
  if (!release || release.desktopVersion !== version) {
    return null
  }
  return {
    releasesBehind: null,
    release: {
      title: isPreviewDesktopVersion(release.desktopVersion)
        ? `Orca ${release.desktopVersion}`
        : `Orca Integration ${release.sha.slice(0, 12)}`,
      description:
        integrationChangeSummary(release) ??
        (process.platform === 'linux'
          ? 'Fork integration build for Linux x64. AppImage updates come from Fartown/orca. Extracted installations require manual replacement.'
          : 'Fork integration build, signed by a fixed self-signed publisher and not notarized. Native updates work between builds with this identity. Older ad-hoc builds require one manual DMG installation first.'),
      releaseNotesUrl: `${INTEGRATION_RELEASES_URL}/tag/${release.tag}`
    }
  }
}

export function isIntegrationBuild(): boolean {
  try {
    if (!app.isPackaged || !['darwin', 'linux'].includes(process.platform)) {
      return false
    }
    if (process.platform === 'linux' && process.arch !== 'x64') {
      return false
    }
    return (
      JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')).orcaUpdateChannel ===
      'integration'
    )
  } catch {
    return false
  }
}

export function integrationUpdateUnavailableMessage(): string | null {
  return isIntegrationBuild() ? linuxAppImageUpdateUnavailableMessage() : null
}

/** Fork builds resolve their feed from fork releases; other builds keep Orca's default feed. */
export async function pinIntegrationReleaseFeedOr<T extends string>(
  updater: Parameters<typeof pinIntegrationReleaseFeed>[0],
  pinDefault: () => Promise<T>
): Promise<T | 'ready'> {
  return (await pinIntegrationReleaseFeed(updater)) ? 'ready' : pinDefault()
}

export async function pinIntegrationReleaseFeed(
  updater: Pick<
    AppUpdater,
    'allowPrerelease' | 'allowDowngrade' | 'disableDifferentialDownload' | 'setFeedURL'
  >
): Promise<boolean> {
  if (!isIntegrationBuild()) {
    return false
  }
  const unavailableMessage = linuxAppImageUpdateUnavailableMessage()
  if (unavailableMessage) {
    throw new Error(unavailableMessage)
  }
  const installedDesktopVersion =
    typeof app.getVersion === 'function' ? app.getVersion() : undefined
  const release = await fetchIntegrationRelease(
    process.platform === 'linux' ? 'linux' : 'mac',
    (input: RequestInfo | URL, init?: RequestInit) =>
      net.fetch(input instanceof URL ? input.toString() : input, init),
    { installedDesktopVersion }
  )
  resolvedRelease = release
  updater.allowPrerelease = true
  updater.allowDowngrade = false
  updater.disableDifferentialDownload = true
  updater.setFeedURL({ provider: 'generic', url: integrationDownloadUrl(release.tag) })
  return true
}
