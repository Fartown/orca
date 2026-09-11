import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSessionTitlesResult } from '../../../shared/ai-vault-session-title'
import {
  resolveTerminalTabTitle,
  resolveUnifiedTabLabel
} from '../../../shared/tab-title-resolution'
import { fixture, nativeResult, LEAF, SIBLING } from './session-name-binding-test-fixture'
import { collectAiVaultTitleRequests } from '../lib/ai-vault-tab-title-requests'
import { aiVaultTitleSyncInputsChanged } from '../lib/ai-vault-tab-title-sync-inputs'
import { startAiVaultTabTitleSync } from '../lib/ai-vault-tab-title-sync'

vi.mock('@/runtime/sync-runtime-graph', () => ({ scheduleRuntimeGraphSync: vi.fn() }))
const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach((stop) => stop()))

describe('session name binding lifetime', () => {
  it('captures the owning leaf PTY instead of the tab primary PTY', () => {
    expect(collectAiVaultTitleRequests(fixture().getState())[0]?.ptyId).toBe('leaf-pty')
  })

  it('does not borrow an inactive agent when the selected leaf is an unnamed shell', () => {
    const store = fixture()
    store.setState((s) => ({
      terminalLayoutsByTabId: {
        tab: {
          ...s.terminalLayoutsByTabId.tab,
          root: {
            type: 'split',
            direction: 'horizontal',
            first: { type: 'leaf', leafId: LEAF },
            second: { type: 'leaf', leafId: SIBLING }
          },
          activeLeafId: SIBLING
        }
      }
    }))
    expect(collectAiVaultTitleRequests(store.getState())).toEqual([])
  })

  it.each(['leaf-pty', 'generation'] as const)(
    'observes %s replacement even when the provider id stays equal',
    (change) => {
      const store = fixture(),
        previous = store.getState()
      if (change === 'leaf-pty') {
        store.setState({
          terminalLayoutsByTabId: {
            tab: {
              ...previous.terminalLayoutsByTabId.tab,
              ptyIdsByLeafId: { [LEAF]: 'replacement-pty' }
            }
          }
        })
      } else {
        store.setState({
          tabsByWorktree: {
            workspace: [{ ...previous.tabsByWorktree.workspace[0], generation: 1 }]
          }
        })
      }
      expect(aiVaultTitleSyncInputsChanged(store.getState(), previous)).toBe(true)
    }
  )

  it('rejects the first A response after an observed A to B to A round trip', async () => {
    const store = fixture(),
      writes: string[] = []
    const completions: ((value: AiVaultSessionTitlesResult) => void)[] = []
    store.subscribe(() => {
      const title = store.slot()?.title
      if (title) {
        writes.push(title)
      }
    })
    const resolveSessionTitles = vi.fn(
      () => new Promise<AiVaultSessionTitlesResult>((resolve) => completions.push(resolve))
    )
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles
      })
    )
    await vi.waitFor(() => expect(completions).toHaveLength(1))
    store.replaceIdentity('B')
    store.replaceIdentity('A')
    completions[0](nativeResult('Stale first A response'))
    await vi.waitFor(() => expect(completions).toHaveLength(2))
    expect(writes).not.toContain('Stale first A response')
    completions[1](nativeResult('Fresh current A response'))
    await vi.waitFor(() => expect(store.slot()?.title).toBe('Fresh current A response'))
  })

  it('removes A from both tab models as soon as the admitted identity becomes B', async () => {
    const store = fixture()
    store.getState().setAiVaultTabTitle('tab', nativeResult('Name of A').titles[0])
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: async () => ({ titles: [] })
      })
    )
    await Promise.resolve()
    store.replaceIdentity('B')
    expect(store.slot()?.sessionId).not.toBe('A')
    expect(store.getState().unifiedTabsByWorktree.workspace[0].aiVaultTitle?.sessionId).not.toBe(
      'A'
    )
  })

  it('does not expose A prompt fallback after replacing its native slot with B', async () => {
    const store = fixture()
    store.getState().setAiVaultTabTitle('tab', nativeResult('Name of A').titles[0])
    store.setState((s) => ({
      tabsByWorktree: {
        workspace: [{ ...s.tabsByWorktree.workspace[0], generatedTitle: 'Task belonging to A' }]
      },
      unifiedTabsByWorktree: {
        workspace: [
          { ...s.unifiedTabsByWorktree.workspace[0], generatedLabel: 'Task belonging to A' }
        ]
      }
    }))
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: async () => ({ titles: [] })
      })
    )
    await Promise.resolve()
    store.replaceIdentity('B')
    const state = store.getState()
    expect(resolveTerminalTabTitle(state.tabsByWorktree.workspace[0], true)).not.toBe(
      'Task belonging to A'
    )
    expect(resolveUnifiedTabLabel(state.unifiedTabsByWorktree.workspace[0], true)).not.toBe(
      'Task belonging to A'
    )
  })
})
