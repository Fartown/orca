import { describe, expect, it, vi } from 'vitest'
import { createUpdateController, type UpdatePorts } from './update-controller'

function fixture() {
  const release = {
    tag: 'integration-1-aaaaaaaaaaaa',
    sha: 'a'.repeat(40),
    desktopVersion: '1.0.0-local.1789228800000.aaaaaaaaaaaa',
    androidVersion: '0.0.48',
    androidVersionCode: 211392000,
    assets: []
  }
  const ports: UpdatePorts = {
    versionCode: vi.fn(() => 16),
    latest: vi.fn(async () => release),
    download: vi.fn(async (_release, progress) => progress(50)),
    verify: vi.fn(async () => {}),
    canInstall: vi.fn(() => true),
    requestPermission: vi.fn(async () => {}),
    install: vi.fn(async () => {})
  }
  return { ...createUpdateController(ports), ports, release }
}

describe('integration Android update controller', () => {
  it('checks, downloads, validates and hands off without claiming installation success', async () => {
    const update = fixture()
    await update.check()
    expect(update.store.getState().stage).toBe('available')
    await update.download()
    expect(update.store.getState()).toMatchObject({ stage: 'ready', progress: 50 })
    expect(update.ports.verify).toHaveBeenCalledOnce()
    await update.install()
    expect(update.ports.verify).toHaveBeenCalledTimes(2)
    expect(update.ports.install).toHaveBeenCalledOnce()
    expect(update.store.getState().stage).toBe('installer-opened')
    update.resume()
    expect(update.store.getState().stage).toBe('ready')
  })

  it.each([211392000, 211392001])(
    'does not downgrade or reinstall versionCode %s',
    async (installed) => {
      const update = fixture()
      vi.mocked(update.ports.versionCode).mockReturnValue(installed)
      await update.check()
      expect(update.store.getState().stage).toBe('latest')
      await update.download()
      expect(update.ports.download).not.toHaveBeenCalled()
    }
  )

  it('reports network failure, permits manual retry and never claims latest', async () => {
    const update = fixture()
    vi.mocked(update.ports.latest).mockRejectedValueOnce(new Error('HTTP 403'))
    await update.check()
    expect(update.store.getState()).toMatchObject({
      stage: 'error',
      release: null,
      error: 'HTTP 403'
    })
    await update.check(true)
    expect(update.store.getState().stage).toBe('available')
  })

  it('deduplicates simultaneous checks and throttles automatic foreground checks', async () => {
    const update = fixture()
    await Promise.all([update.check(), update.check()])
    await update.check()
    expect(update.ports.latest).toHaveBeenCalledOnce()
    await update.check(true)
    expect(update.ports.latest).toHaveBeenCalledTimes(2)
  })

  it('never opens the installer after a checksum or signature rejection', async () => {
    const update = fixture()
    vi.mocked(update.ports.verify).mockRejectedValue(new Error('signature mismatch'))
    await update.check()
    await update.download()
    await update.install()
    expect(update.store.getState()).toMatchObject({ stage: 'error', error: 'signature mismatch' })
    expect(update.ports.install).not.toHaveBeenCalled()
  })

  it('returns from unknown-source authorization without launching the installer implicitly', async () => {
    const update = fixture()
    vi.mocked(update.ports.canInstall).mockReturnValue(false)
    await update.check()
    await update.download()
    await update.install()
    expect(update.store.getState().stage).toBe('permission')
    expect(update.ports.requestPermission).toHaveBeenCalledOnce()
    update.resume()
    expect(update.store.getState().stage).toBe('permission')
    vi.mocked(update.ports.canInstall).mockReturnValue(true)
    update.resume()
    expect(update.store.getState().stage).toBe('ready')
    expect(update.ports.install).not.toHaveBeenCalled()
    await update.install()
    expect(update.ports.install).toHaveBeenCalledOnce()
  })

  it('deduplicates downloads and preserves an in-flight offer during check requests', async () => {
    const update = fixture()
    await update.check()
    let finish!: () => void
    vi.mocked(update.ports.download).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const pending = update.download()
    await update.download()
    await update.check(true)
    expect(update.store.getState().stage).toBe('downloading')
    expect(update.ports.download).toHaveBeenCalledOnce()
    finish()
    await pending
    expect(update.store.getState().stage).toBe('ready')
  })

  it('permits retry after a failed download', async () => {
    const update = fixture()
    vi.mocked(update.ports.download).mockRejectedValueOnce(new Error('network lost'))
    await update.check()
    await update.download()
    expect(update.store.getState().stage).toBe('error')
    await update.download()
    expect(update.store.getState().stage).toBe('ready')
  })
})
