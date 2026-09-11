import { afterEach, expect, it, vi } from 'vitest'
import { startAiVaultTabTitleSync } from '../lib/ai-vault-tab-title-sync'
import { fixture, PANE } from './session-name-binding-test-fixture'
import { getActivitySessionName } from './activity-session-name'
import {
  resolveTerminalTabTitle,
  resolveUnifiedTabLabel
} from '../../../shared/tab-title-resolution'
import { createGlobalSettingsFixture } from '../../../shared/global-settings-test-fixture'

vi.mock('@/runtime/sync-runtime-graph', () => ({ scheduleRuntimeGraphSync: vi.fn() }))
const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach((stop) => stop()))

it.each(['local', 'ssh:dev-box'] as const)(
  'enabling generation projects the existing own prompt to Top, unified tab and Activity on %s',
  (host) => {
    const store = fixture()
    store.setState((s) => ({
      activeWorkspaceExecutionHostId: host,
      settings: createGlobalSettingsFixture({ tabAutoGenerateTitle: false }),
      agentStatusByPaneKey: {
        [PANE]: { ...s.agentStatusByPaneKey[PANE], prompt: '仅Hook首任务K18' }
      }
    }))
    store.getState().updateTabTitle('tab', 'Codex')
    const missing = { kind: 'unavailable' as const }
    store.getState().setAiVaultTabTitle('tab', {
      agent: 'codex',
      sessionId: 'A',
      title: 'Codex A',
      providerName: missing
    })
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: vi.fn(async () => ({ titles: [] })),
        scheduleReconcile: () => () => undefined
      })
    )
    const entry = store.getState().agentStatusByPaneKey[PANE]
    const before = store.getState().tabsByWorktree.workspace[0]
    expect(before.generatedTitle).toBeFalsy()
    expect(getActivitySessionName(entry, before, false)).toBe('Codex A')
    store.setState({ settings: createGlobalSettingsFixture({ tabAutoGenerateTitle: true }) })
    const tab = store.getState().tabsByWorktree.workspace[0]
    expect(resolveTerminalTabTitle(tab, true)).toBe('仅Hook首任务K18')
    expect(resolveUnifiedTabLabel(store.getState().unifiedTabsByWorktree.workspace[0], true)).toBe(
      '仅Hook首任务K18'
    )
    expect(getActivitySessionName(entry, tab, true)).toBe('仅Hook首任务K18')
    expect(tab.aiVaultTitle?.generatedTitle).toBeUndefined()
    store.setState({ settings: createGlobalSettingsFixture({ tabAutoGenerateTitle: false }) })
    expect(resolveTerminalTabTitle(store.getState().tabsByWorktree.workspace[0], false)).toBe(
      'Codex A'
    )
    expect(getActivitySessionName(entry, tab, false)).toBe('Codex A')
  }
)
