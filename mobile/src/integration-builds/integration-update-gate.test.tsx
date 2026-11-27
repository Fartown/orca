import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntegrationRelease } from '../../../src/shared/integration-builds/release-catalog'
import { createUpdateController, type UpdatePorts } from './update-controller'

const mocks = vi.hoisted(() => {
  const state: { update: ReturnType<typeof createUpdateController> | null } = { update: null }
  return {
    state,
    alert: vi.fn(),
    download: vi.fn(async () => {}),
    push: vi.fn()
  }
})

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.0.68' } } }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 })
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
  Alert: { alert: mocks.alert },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} })
  },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('./mobile-updates', () => ({
  integrationUpdatesEnabled: true,
  get mobileUpdates() {
    if (!mocks.state.update) {
      throw new Error('Missing update controller')
    }
    return mocks.state.update
  },
  downloadAndInstallUpdate: mocks.download
}))

import { IntegrationSettingsUpdateSection } from './IntegrationSettingsUpdateSection'
import { IntegrationUpdateGate } from './IntegrationUpdateGate'
import { IntegrationUpdateRow } from './IntegrationUpdateRow'

let renderer: ReactTestRenderer | null = null

function makeRelease(tag: string, extra: Partial<IntegrationRelease> = {}): IntegrationRelease {
  return {
    tag,
    sha: '5f72d6e481cd'.padEnd(40, '0'),
    desktopVersion: '1.4.214-preview.103',
    androidVersion: '0.0.68',
    androidVersionCode: 217811062,
    assets: [],
    changes: [
      { number: 160, title: 'fix(session-names): 全链路统一会话命名' },
      { title: '新功能：Goal 守卫接管确认框 (#152)' }
    ],
    ...extra
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('mobile integration update prompt and settings changelog', () => {
  it('includes merged release changes and preview version in the foreground update alert and settings rows', async () => {
    const release = makeRelease('integration-103-5f72d6e481cd')
    const ports: UpdatePorts = {
      versionCode: () => 217750000,
      latest: vi.fn(async () => release),
      download: vi.fn(async () => {}),
      verify: vi.fn(async () => {}),
      canInstall: () => true,
      requestPermission: vi.fn(async () => {}),
      install: vi.fn(async () => {})
    }
    mocks.state.update = createUpdateController(ports)

    await act(async () => {
      renderer = create(
        createElement(
          'View',
          null,
          createElement(IntegrationUpdateGate),
          createElement(IntegrationSettingsUpdateSection),
          createElement(IntegrationUpdateRow)
        )
      )
    })

    expect(mocks.alert).toHaveBeenCalledOnce()
    const [title, message] = mocks.alert.mock.calls[0]
    const expectedSummary =
      'fix(session-names): 全链路统一会话命名 · 新功能：Goal 守卫接管确认框 (#152)'
    expect(title).toBe('Orca update available')
    expect(message).toContain(expectedSummary)
    expect(message).toContain('1.4.214-preview.103 (5f72d6e481cd)')

    const aboutRowTexts = renderer!.root
      .findAll((node) => String(node.type) === 'Text')
      .flatMap((node) => node.children)
    const settingsNotes = renderer!.root
      .findAll((node) => String(node.type) === 'SettingsNote')
      .flatMap((node) => node.children)
    expect(aboutRowTexts).toContain(expectedSummary)
    expect(settingsNotes).toContain(expectedSummary)
  })
})
