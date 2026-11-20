import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdaterSetup } from '../updater/lifecycle/updater-setup'

const fixture = vi.hoisted(() => ({
  root: '',
  identity: vi.fn<() => { appImagePath: string } | null>()
}))
const { autoUpdater } = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  return {
    autoUpdater: Object.assign(new EventEmitter(), {
      allowPrerelease: false,
      allowDowngrade: false,
      disableDifferentialDownload: false,
      setFeedURL: vi.fn(),
      checkForUpdates: vi.fn<() => Promise<unknown>>(async () => null),
      downloadUpdate: vi.fn(async () => []),
      quitAndInstall: vi.fn()
    })
  }
})

vi.mock('electron', () => ({
  app: Object.assign(new EventEmitter(), {
    isPackaged: true,
    getVersion: () => '1.0.0',
    getAppPath: () => fixture.root
  }),
  autoUpdater: new EventEmitter(),
  powerMonitor: new EventEmitter(),
  net: { fetch: vi.fn() }
}))
vi.mock('../updater/linux-package/appimage-runtime-identity', () => ({
  resolveAppImageRuntimeIdentity: fixture.identity
}))
vi.mock('../updater/electron-updater-loader', () => ({
  loadElectronAutoUpdater: () => autoUpdater
}))
vi.mock('../updater/linux-package/linux-update-package-type', () => ({
  getLinuxPackageType: () => 'non-root',
  getLinuxRootPackageType: () => null,
  isExternallyManagedLinuxInstall: () => false
}))
vi.mock('../updater/nudges/nudge-campaign', () => ({ fetchNudge: async () => null }))
vi.mock('../updater/releases/updater-changelog', () => ({ fetchChangelog: async () => null }))
vi.mock('../updater/updater-lifecycle-diagnostics', () => ({ recordUpdaterLifecycle: vi.fn() }))
vi.mock('../ipc/pty/provider/kill-all', () => ({ hasInProcessTerminalSessions: () => false }))

const platform = Object.getOwnPropertyDescriptor(process, 'platform')
const arch = Object.getOwnPropertyDescriptor(process, 'arch')

beforeEach(async () => {
  autoUpdater.removeAllListeners()
  autoUpdater.checkForUpdates.mockClear()
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
    const updater = new UpdaterSetup()
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
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('retains automatic update support for a validated AppImage source', async () => {
    fixture.identity.mockReturnValue({ appImagePath: '/opt/Orca.AppImage' })
    const updater = new UpdaterSetup()
    updater.setupAutoUpdater(null, { getLastUpdateCheckAt: () => Date.now() })
    expect(updater.getRemoteServerUpdaterSnapshot('runtime-test').support).toEqual({
      installMode: 'interactive',
      automatic: true,
      reason: 'available'
    })
  })
})
