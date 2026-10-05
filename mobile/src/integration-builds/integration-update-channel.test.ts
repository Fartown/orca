import { beforeEach, describe, expect, it, vi } from 'vitest'

const constants = vi.hoisted(() => ({ expoConfig: { version: '0.0.1', extra: {} as object } }))
const releaseCheck = vi.hoisted(() => vi.fn())
const storeCheck = vi.hoisted(() => vi.fn())

vi.mock('expo-constants', () => ({ default: constants }))
vi.mock('expo-linking', () => ({ openURL: vi.fn() }))
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  Platform: { OS: 'android' }
}))
vi.mock('../storage/app-update-preferences', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadAppUpdatePreferences: vi.fn(async () => ({})),
  saveAppUpdateCheck: vi.fn(async () => {}),
  saveDismissedAppUpdateVersion: vi.fn(async () => {})
}))
vi.mock('../app-update/github-release-update-source', () => ({
  githubReleaseUpdateSource: { check: releaseCheck }
}))
vi.mock('../app-update/app-store-update-source', () => ({
  appStoreUpdateSource: { check: storeCheck }
}))

async function startChecker(channel: string | undefined): Promise<void> {
  constants.expoConfig.extra = channel ? { orcaUpdateChannel: channel } : {}
  vi.resetModules()
  const { appUpdateChecker } = await import('../app-update/app-update-runtime')
  appUpdateChecker.start()
}

describe('upstream app update source on fork integration builds', () => {
  beforeEach(() => {
    releaseCheck.mockReset().mockResolvedValue({ kind: 'current' })
    storeCheck.mockReset()
  })

  it('never asks upstream releases on an integration build', async () => {
    await startChecker('integration')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(releaseCheck).not.toHaveBeenCalled()
  })

  it('keeps upstream releases for builds outside the integration channel', async () => {
    await startChecker(undefined)
    await vi.waitFor(() => expect(releaseCheck).toHaveBeenCalled())
  })
})
