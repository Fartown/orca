import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from '../updater-test-module-loader'

const fixture = vi.hoisted(() => ({
  root: '',
  identity: vi.fn<() => { appImagePath: string } | null>()
}))
vi.mock('../appimage-runtime-identity', () => ({
  resolveAppImageRuntimeIdentity: fixture.identity
}))
const { autoUpdaterMock, moduleFactories, resetUpdaterMocks } = await vi.hoisted(async () =>
  (await import('../updater-test-harness')).createUpdaterMocks()
)

vi.mock('electron', () => {
  const source = moduleFactories.electron()
  Object.defineProperty(source.app, 'getAppPath', { configurable: true, value: () => fixture.root })
  return source
})
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('../electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('@electron-toolkit/utils', () => moduleFactories.electronToolkitUtils())
vi.mock('../ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('../linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('../updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('../updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('../updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('../update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('../updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('../local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('../local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

warmUpdaterModule()
const platform = Object.getOwnPropertyDescriptor(process, 'platform')
const arch = Object.getOwnPropertyDescriptor(process, 'arch')

beforeEach(async () => {
  resetUpdaterMocks()
  fixture.identity.mockReturnValue(null)
  fixture.root = await mkdtemp(join(tmpdir(), 'orca-updater-availability-'))
  await writeFile(
    join(fixture.root, 'package.json'),
    JSON.stringify({ orcaUpdateChannel: 'integration' })
  )
  Object.defineProperty(process, 'platform', { value: 'linux' })
  Object.defineProperty(process, 'arch', { value: 'x64' })
})

afterEach(async () => {
  vi.useRealTimers()
  if (platform) {
    Object.defineProperty(process, 'platform', platform)
  }
  if (arch) {
    Object.defineProperty(process, 'arch', arch)
  }
  await rm(fixture.root, { recursive: true, force: true })
})

describe('disabled integration AppImage updater through the public updater API', () => {
  it('publishes automatic:false to paired clients and an error to desktop checks', async () => {
    const updater = await loadUpdaterModule()
    vi.useFakeTimers()
    updater.setupAutoUpdater(null, { getLastUpdateCheckAt: () => Date.now() })
    expect(updater.getRemoteServerUpdaterSnapshot('runtime-test').support).toEqual({
      installMode: 'interactive',
      automatic: false,
      reason: 'manual-service-update-required'
    })
    expect(() => updater.checkForRemoteServerUpdate('runtime-test')).toThrow(
      'remote_update_manual_required'
    )
    updater.checkForUpdatesFromMenu()
    await vi.advanceTimersByTimeAsync(1500)
    expect(updater.getUpdateStatus()).toMatchObject({
      state: 'error',
      message: expect.stringContaining('original AppImage'),
      userInitiated: true
    })
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('retains automatic update support for a validated AppImage source', async () => {
    fixture.identity.mockReturnValue({ appImagePath: '/opt/Orca.AppImage' })
    const updater = await loadUpdaterModule()
    updater.setupAutoUpdater(null, { getLastUpdateCheckAt: () => Date.now() })
    expect(updater.getRemoteServerUpdaterSnapshot('runtime-test').support).toEqual({
      installMode: 'interactive',
      automatic: true,
      reason: 'available'
    })
  })
})
