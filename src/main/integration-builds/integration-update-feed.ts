import { app, net } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import {
  fetchIntegrationRelease,
  integrationDownloadUrl,
  INTEGRATION_RELEASES_URL,
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
      title: `Orca Integration ${release.sha.slice(0, 12)}`,
      description:
        'Fork integration build. This ad-hoc macOS build requires manual DMG installation; native automatic installation needs a stable signing identity.',
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

export async function pinIntegrationReleaseFeed(updater: AppUpdater): Promise<boolean> {
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
