import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdater } from 'electron-updater'

const mock = vi.hoisted(() => ({
  app: { isPackaged: true, getAppPath: () => '/isolated-app' },
  readFileSync: vi.fn(),
  fetch: vi.fn()
}))
vi.mock('electron', () => ({ app: mock.app, net: { fetch: mock.fetch } }))
vi.mock('node:fs', () => ({ readFileSync: mock.readFileSync }))
import {
  integrationChangelog,
  isIntegrationBuild,
  pinIntegrationReleaseFeed
} from './integration-update-feed'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
afterEach(() => {
  Object.defineProperty(process, 'platform', platform)
  mock.app.isPackaged = true
  vi.resetAllMocks()
})

const feedUpdater = () => ({
  allowPrerelease: false,
  allowDowngrade: true,
  disableDifferentialDownload: false,
  setFeedURL: vi.fn()
})

function fork() {
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  mock.readFileSync.mockReturnValue('{"orcaUpdateChannel":"integration"}')
}

describe('integration-only default updater feed', () => {
  it('leaves unmarked builds and unsupported platforms unchanged', async () => {
    fork()
    mock.readFileSync.mockReturnValue('{}')
    expect(await pinIntegrationReleaseFeed({} as AppUpdater)).toBe(false)
    fork()
    Object.defineProperty(process, 'platform', { value: 'linux' })
    expect(isIntegrationBuild()).toBe(false)
    expect(mock.fetch).not.toHaveBeenCalled()
  })

  it('does not enable integration updates for development apps', () => {
    fork()
    mock.app.isPackaged = false
    expect(isIntegrationBuild()).toBe(false)
  })

  const tag = 'integration-123-aaaaaaaaaaaa'
  const localVersion = '1.2.3-local.1789228800000.aaaaaaaaaaaa'

  function publish(manifest: Record<string, unknown>) {
    const assets = ['orca-integration-macos-arm64.zip', 'orca-integration-macos-x64.zip'].map(
      (name) => ({ name, bytes: 123, sha256: 'b'.repeat(64) })
    )
    mock.fetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              tag_name: tag,
              draft: false,
              prerelease: true,
              assets: [...assets, { name: 'build-info.json' }, { name: 'latest-mac.yml' }]
            }
          ])
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 2,
            tag,
            sha: 'a'.repeat(40),
            desktopVersion: localVersion,
            androidVersion: '0.0.48',
            androidVersionCode: 211392000,
            assets,
            ...manifest
          })
        )
      )
  }

  it('pins the concrete fork feed and matching notes without allowing downgrades', async () => {
    fork()
    const version = localVersion
    publish({})
    const updater = feedUpdater()
    expect(await pinIntegrationReleaseFeed(updater)).toBe(true)
    expect(updater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: `https://github.com/Fartown/orca/releases/download/${tag}`
    })
    expect(updater.allowPrerelease).toBe(true)
    expect(updater.allowDowngrade).toBe(false)
    expect(integrationChangelog(version)?.release.releaseNotesUrl).toBe(
      `https://github.com/Fartown/orca/releases/tag/${tag}`
    )
    expect(integrationChangelog('another-version')).toBe(null)
    expect(integrationChangelog(version)?.release).toMatchObject({
      title: 'Orca Integration aaaaaaaaaaaa',
      description: expect.stringContaining('Fork integration build')
    })
  })

  it('describes the update by what merged, keeping the card to one short paragraph', async () => {
    fork()
    const version = '1.4.197-preview.12'
    const changes = [
      { number: 34, title: 'feat: four' },
      { title: "Merge remote-tracking branch 'upstream/main' into fork/integration" },
      { number: 32, title: 'fix: two' },
      { number: 31, title: 'feat: one' },
      { number: 30, title: 'feat: zero' }
    ]
    publish({ desktopVersion: version, changes })
    await pinIntegrationReleaseFeed(feedUpdater())
    expect(integrationChangelog(version)?.release).toMatchObject({
      title: 'Orca 1.4.197-preview.12',
      description:
        "feat: four · Merge remote-tracking branch 'upstream/main' into fork/integration · fix: two +2"
    })

    publish({ desktopVersion: version, changes: changes.slice(0, 1) })
    await pinIntegrationReleaseFeed(feedUpdater())
    expect(integrationChangelog(version)?.release.description).toBe('feat: four')
  })

  it('does not fall back to upstream when the fork check fails', async () => {
    fork()
    mock.fetch.mockRejectedValue(new Error('offline'))
    const updater = feedUpdater()
    await expect(pinIntegrationReleaseFeed(updater)).rejects.toThrow('offline')
    expect(updater.setFeedURL).not.toHaveBeenCalled()
  })
})
