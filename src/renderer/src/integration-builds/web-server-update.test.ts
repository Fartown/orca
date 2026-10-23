import { beforeEach, describe, expect, it, vi } from 'vitest'
const fakes = vi.hoisted(() => ({
  read: vi.fn(),
  open: vi.fn(),
  refresh: vi.fn(async () => undefined)
}))
vi.mock('../web/preload-api/web-runtime-session', () => ({
  webRuntimeState: { activeClient: { statusOwner: { read: fakes.read } } }
}))
vi.mock('../store', () => ({
  useAppStore: {
    getState: () => ({
      setRemoteServerUpdateDialogOpen: fakes.open,
      refreshRemoteServerUpdates: fakes.refresh
    })
  }
}))
import { openWebServerUpdate, webServerVersion } from './web-server-update'
beforeEach(() => {
  vi.clearAllMocks()
})

describe('browser update entry', () => {
  it('opens the existing server update UI and requests a real check even without modifiers', async () => {
    await openWebServerUpdate()
    expect(fakes.open).toHaveBeenCalledWith(true)
    expect(fakes.refresh).toHaveBeenCalledWith({})
    await openWebServerUpdate({ includePrerelease: true })
    expect(fakes.refresh).toHaveBeenLastCalledWith({ includePrerelease: true })
  })
  it('uses only the shared connection owner verified version without making host requests', () => {
    fakes.read.mockReturnValue({
      verification: 'verified',
      transport: 'ready',
      status: { appVersion: '1.4.214-preview.54' }
    })
    expect(webServerVersion()).toBe('1.4.214-preview.54')
    for (const state of [
      null,
      { verification: 'unavailable', transport: 'disconnected', status: { appVersion: 'stale' } },
      {
        verification: 'verified',
        transport: 'ready',
        retired: true,
        status: { appVersion: 'retired' }
      }
    ]) {
      fakes.read.mockReturnValue(state)
      expect(webServerVersion()).toBe('web')
    }
    expect(fakes.refresh).not.toHaveBeenCalled()
  })
})
