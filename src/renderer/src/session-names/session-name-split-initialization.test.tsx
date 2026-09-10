// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTerminalPaneLayoutBindings } from '../components/terminal-pane/use-terminal-pane-layout-bindings'
import type { TerminalPaneLayoutController } from '../components/terminal-pane/use-terminal-pane-layout-persistence'
import { createTerminalLayoutActions } from '../store/terminals/terminal-layout-state'
import { startAiVaultTabTitleSync } from '../lib/ai-vault-tab-title-sync'
import { fixture, nativeResult, LEAF, SIBLING } from './session-name-binding-test-fixture'

let store: ReturnType<typeof fixture>
vi.mock('../store', () => ({ useAppStore: { getState: () => store.getState() } }))
vi.mock('@/runtime/sync-runtime-graph', () => ({ scheduleRuntimeGraphSync: vi.fn() }))
vi.mock('../components/terminal-pane/expand-collapse', () => ({
  useExpandCollapseActions: () => ({})
}))
const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach((stop) => stop()))

function mountBinding(selectedLeaf = SIBLING, selectedPaneId = 2) {
  store = fixture()
  store.setState((s) => ({
    terminalLayoutsByTabId: {
      tab: {
        ...s.terminalLayoutsByTabId.tab,
        root: {
          type: 'split',
          direction: 'vertical',
          first: { type: 'leaf', leafId: LEAF },
          second: { type: 'leaf', leafId: SIBLING }
        }
      }
    }
  }))
  store.getState().setAiVaultTabTitle('tab', nativeResult('Name of inactive A').titles[0])
  stops.push(
    startAiVaultTabTitleSync({
      getState: store.getState,
      subscribe: store.subscribe,
      resolveSessionTitles: async () => ({ titles: [] })
    })
  )
  const actions = createTerminalLayoutActions(store.setState, store.getState)
  const controller = {
    tabId: 'tab',
    setTabLayout: actions.setTabLayout,
    managerRef: {
      current: { getActivePane: () => ({ id: selectedPaneId, leafId: selectedLeaf }) }
    },
    paneTransportsRef: { current: new Map() }
  } as unknown as TerminalPaneLayoutController
  return renderHook(() => useTerminalPaneLayoutBindings(controller))
}

describe('new split PTY registration and session-name ownership', () => {
  it.each(['local-child-pty', 'remote:ssh-host@@child-pty'])(
    'publishes the selected empty leaf when its %s arrives, without an extra click',
    (ptyId) => {
      const hook = mountBinding()
      expect(store.getState().terminalLayoutsByTabId.tab.activeLeafId).toBe(LEAF)
      act(() => hook.result.current.syncPanePtyLayoutBindingForLeaf(SIBLING, ptyId, 2))
      expect(store.getState().terminalLayoutsByTabId.tab.ptyIdsByLeafId?.[SIBLING]).toBe(ptyId)
      expect(store.getState().terminalLayoutsByTabId.tab.activeLeafId).toBe(SIBLING)
      expect(store.slot()?.title).not.toBe('Name of inactive A')
      hook.unmount()
    }
  )

  it('does not select a late child whose user-selected pane is now A', () => {
    const hook = mountBinding(LEAF, 1)
    act(() => hook.result.current.syncPanePtyLayoutBindingForLeaf(SIBLING, 'child-pty', 2))
    expect(store.getState().terminalLayoutsByTabId.tab.activeLeafId).toBe(LEAF)
    expect(store.slot()?.title).toBe('Name of inactive A')
    hook.unmount()
  })

  it('does not copy a selection from a different numeric pane lifetime', () => {
    const hook = mountBinding(SIBLING, 3)
    act(() => hook.result.current.syncPanePtyLayoutBindingForLeaf(SIBLING, 'child-pty', 2))
    expect(store.getState().terminalLayoutsByTabId.tab.activeLeafId).toBe(LEAF)
    hook.unmount()
  })
})
