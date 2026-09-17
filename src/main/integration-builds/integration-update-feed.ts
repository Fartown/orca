import { app, net } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import {
  fetchIntegrationRelease,
  integrationChanges,
  integrationDownloadUrl,
  INTEGRATION_RELEASES_URL,
  isPreviewDesktopVersion,
  type IntegrationRelease
} from '../../shared/integration-builds/release-catalog'

const SHOWN_CHANGES = 3

let resolvedRelease: IntegrationRelease | null = null

// The update card renders one paragraph; the release page keeps the full list.
function changeSummary(release: IntegrationRelease): string | null {
  const changes = integrationChanges(release)
  if (!changes.length) {
    return null
  }
  const shown = changes
    .slice(0, SHOWN_CHANGES)
    .map((change) => change.title)
    .join(' · ')
  return changes.length > SHOWN_CHANGES ? `${shown} +${changes.length - SHOWN_CHANGES}` : shown
}

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
        changeSummary(release) ??
        'Fork integration build, signed by a fixed self-signed publisher and not notarized. Native updates work between builds with this identity. Older ad-hoc builds require one manual DMG installation first.',
      releaseNotesUrl: `${INTEGRATION_RELEASES_URL}/tag/${release.tag}`
    }
  }
}

export function isIntegrationBuild(): boolean {
  try {
    if (!app.isPackaged || process.platform !== 'darwin') {
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

export async function pinIntegrationReleaseFeed(
  updater: Pick<
    AppUpdater,
    'allowPrerelease' | 'allowDowngrade' | 'disableDifferentialDownload' | 'setFeedURL'
  >
): Promise<boolean> {
  if (!isIntegrationBuild()) {
    return false
  }
  const release = await fetchIntegrationRelease('mac', net.fetch.bind(net) as typeof fetch)
  resolvedRelease = release
  updater.allowPrerelease = true
  updater.allowDowngrade = false
  updater.disableDifferentialDownload = true
  updater.setFeedURL({ provider: 'generic', url: integrationDownloadUrl(release.tag) })
  return true
}
