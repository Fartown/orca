import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUpdateController, type UpdatePorts } from './update-controller'
import type { IntegrationRelease } from '../../../src/shared/integration-builds/release-catalog'
import { SettingsAppUpdateSection } from '../settings/settings-app-update-section'
import { IntegrationUpdateRow } from './IntegrationUpdateRow'

const fixture = vi.hoisted(() => {
  const state: { update: ReturnType<typeof createUpdateController> | null } = { update: null }
  return {
    state,
    enabled: true,
    legacyCheck: vi.fn(async () => 'failed'),
    download: vi.fn(async () => {})
  }
})
vi.mock('../app-update/app-update-runtime', () => ({
  installedAppVersion: '0.0.62',
  canCheckForAppUpdates: true,
  appUpdateChecker: { checkNow: fixture.legacyCheck },
  useAppUpdateState: () => ({ checking: false, available: null, lastCheckedAt: null }),
  openAppUpdate: vi.fn()
}))
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.0.62' } } }))
vi.mock('./mobile-updates', () => ({
  get integrationUpdatesEnabled() {
    return fixture.enabled
  },
  get mobileUpdates() {
    if (!fixture.state.update) {
      throw new Error('Missing update fixture')
    }
    return fixture.state.update
  },
  downloadAndInstallUpdate: fixture.download
}))
vi.mock(
  '../settings/settings-screen-frame',
  async () => (await import('../test-support/settings-chrome-test-double')).settingsFrameDouble
)
vi.mock(
  '../components/list/ListGroup',
  async () => (await import('../test-support/settings-chrome-test-double')).listGroupDouble
)
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))

let renderer: ReactTestRenderer | null = null
let update: ReturnType<typeof createUpdateController>
const release: IntegrationRelease = {
  tag: 'integration-1-aaaaaaaaaaaa',
  sha: 'a'.repeat(40),
  desktopVersion: '1.0.0-preview.1',
  androidVersion: '0.0.62',
  androidVersionCode: 200,
  assets: []
}
const ports = {
  versionCode: () => 100,
  latest: vi.fn(async () => release),
  download: vi.fn<UpdatePorts['download']>(async (_release, progress) => {
    progress(29)
  }),
  verify: vi.fn(async () => {}),
  canInstall: vi.fn(() => true),
  requestPermission: vi.fn(async () => {}),
  install: vi.fn(async () => {})
}
beforeEach(() => {
  fixture.enabled = true
  vi.clearAllMocks()
  ports.latest.mockResolvedValue(release)
  ports.canInstall.mockReturnValue(true)
  update = createUpdateController(ports)
  fixture.state.update = update
  fixture.download.mockImplementation(() => update.download())
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

function mount() {
  act(() => {
    renderer = create(
      createElement(
        'View',
        null,
        createElement(SettingsAppUpdateSection),
        createElement(IntegrationUpdateRow)
      )
    )
  })
  if (!renderer) {
    throw new Error('No rendered settings')
  }
  return renderer.root
}

describe('integration settings and About update entry', () => {
  it('routes the outer settings check through the fork controller even when the disabled legacy checker returns failed', async () => {
    const root = mount()
    const row = root
      .findAll((n) => String(n.type) === 'ListRow')
      .find((n) => n.props.title === 'Check for updates')
    expect(row).toBeDefined()
    await act(async () => row?.props.onPress())
    expect(fixture.legacyCheck).not.toHaveBeenCalled()
    expect(ports.latest).toHaveBeenCalledOnce()
    expect(update.store.getState().stage).toBe('available')
  })

  it('shares download progress, suppresses duplicate checks, and resumes the same downloaded installer', async () => {
    const root = mount()
    await act(async () => update.check(true))
    const completed = Promise.withResolvers<void>()
    ports.download.mockImplementationOnce(async (_release, progress) => {
      progress(29)
      await completed.promise
    })
    let downloading: Promise<void> | undefined
    await act(async () => {
      downloading = update.download()
    })
    expect(
      root
        .findAll((n) => String(n.type) === 'ListRow')
        .some((n) => String(n.props.title).includes('29%'))
    ).toBe(true)
    expect(
      root
        .findAll((n) => String(n.type) === 'Text')
        .filter((n) => n.children.some((c) => typeof c === 'string' && c.includes('29%'))).length
    ).toBeGreaterThan(0)
    await act(async () => {
      for (const row of root.findAll(
        (n) => String(n.type) === 'ListRow' && typeof n.props.onPress === 'function'
      )) {
        row.props.onPress()
      }
    })
    expect(ports.latest).toHaveBeenCalledOnce()
    expect(ports.download).toHaveBeenCalledOnce()
    await act(async () => {
      completed.resolve()
      await downloading
    })
    const install = root
      .findAll((n) => String(n.type) === 'ListRow')
      .find((n) => n.props.title === 'Install downloaded update')
    expect(install).toBeDefined()
    await act(async () => install?.props.onPress())
    expect(ports.install).toHaveBeenCalledOnce()
    expect(update.store.getState().stage).toBe('installer-opened')
    expect(fixture.legacyCheck).not.toHaveBeenCalled()
  })

  it('keeps the existing official-channel checker outside integration builds', async () => {
    fixture.enabled = false
    const root = mount()
    const row = root
      .findAll((n) => String(n.type) === 'ListRow')
      .find((n) => n.props.title === 'Check for updates')
    await act(async () => row?.props.onPress())
    expect(fixture.legacyCheck).toHaveBeenCalledOnce()
    expect(ports.latest).not.toHaveBeenCalled()
  })

  it('shows a real fork error and latest result from the same controller', async () => {
    const root = mount()
    ports.latest.mockRejectedValueOnce(new Error('HTTP 503'))
    await act(async () => update.check(true))
    expect(
      root
        .findAll((n) => String(n.type) === 'SettingsNote')
        .some((n) => n.children.includes('HTTP 503'))
    ).toBe(true)
    expect(
      root.findAll((n) => String(n.type) === 'Text').some((n) => n.children.includes('HTTP 503'))
    ).toBe(true)
    expect(
      root.findAll((n) => String(n.type) === 'ListRow').some((n) => n.props.value === 'Up to date')
    ).toBe(false)
    ports.latest.mockResolvedValueOnce({ ...release, androidVersionCode: 100 })
    await act(async () => update.check(true))
    expect(
      root.findAll((n) => String(n.type) === 'ListRow').some((n) => n.props.value === 'Up to date')
    ).toBe(true)
    expect(fixture.legacyCheck).not.toHaveBeenCalled()
  })

  it('shares permission and continue-install actions without claiming installation success', async () => {
    const root = mount()
    ports.canInstall.mockReturnValue(false)
    await act(async () => {
      await update.check(true)
      await update.download()
    })
    const row = root
      .findAll((n) => String(n.type) === 'ListRow')
      .find((n) => n.props.title === 'Install downloaded update')
    await act(async () => row?.props.onPress())
    expect(update.store.getState().stage).toBe('permission')
    expect(ports.requestPermission).toHaveBeenCalledOnce()
    expect(ports.install).not.toHaveBeenCalled()
    ports.canInstall.mockReturnValue(true)
    const about = root.findAll(
      (n) => String(n.type) === 'Pressable' && typeof n.props.onPress === 'function'
    )[0]
    await act(async () => about.props.onPress())
    expect(ports.install).toHaveBeenCalledOnce()
    expect(update.store.getState().stage).toBe('installer-opened')
  })
})
