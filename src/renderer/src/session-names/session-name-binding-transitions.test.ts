import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSessionTitlesResult } from '../../../shared/ai-vault-session-title'
import { collectAiVaultTitleRequests } from '../lib/ai-vault-tab-title-requests'
import { startAiVaultTabTitleSync } from '../lib/ai-vault-tab-title-sync'
import { fixture, nativeResult, LEAF, PANE, SIBLING } from './session-name-binding-test-fixture'
import { createSessionNameStore } from './session-name-store'
import { getDefaultSettings } from '../../../shared/constants'
import { canonicalSessionTitleKey } from '../lib/canonical-session-titles'

vi.mock('@/runtime/sync-runtime-graph', () => ({ scheduleRuntimeGraphSync: vi.fn() }))
const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach((stop) => stop()))

describe('session name binding replacement boundaries', () => {
  it('does not launder an old A response through the shared cache after A to B to A', async () => {
    const store = fixture()
    let finish!: (value: AiVaultSessionTitlesResult) => void
    const resolve = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            finish = done
          })
      )
      .mockResolvedValue(nativeResult('Current A read'))
    const names = createSessionNameStore(resolve)
    const writes: string[] = []
    store.subscribe(() => {
      if (store.slot()?.title) {
        writes.push(store.slot()!.title)
      }
    })
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: names.resolveSessionTitles,
        subscribeSessionNames: names.subscribe,
        getSessionName: (request) =>
          names
            .getSnapshot()
            .get(
              canonicalSessionTitleKey(
                request.executionHostId,
                request.agent,
                request.providerSession.id
              )
            ),
        invalidateSessionNames: (requests) =>
          names.invalidate(
            requests.map((request) => ({
              executionHostId: request.executionHostId,
              agent: request.agent,
              sessionId: request.providerSession.id
            }))
          )
      })
    )
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(1))
    store.replaceIdentity('B')
    store.replaceIdentity('A')
    finish(nativeResult('Old A read'))
    await vi.waitFor(() => expect(store.slot()?.title).toBe('Current A read'))
    expect(writes).not.toContain('Old A read')
  })

  it.each(['leaf-pty', 'generation', 'host'] as const)(
    'rejects an in-flight response after %s changes with the same session id',
    async (change) => {
      const store = fixture()
      const completions: ((value: AiVaultSessionTitlesResult) => void)[] = []
      const writes: string[] = []
      store.subscribe(() => {
        if (store.slot()?.title) {
          writes.push(store.slot()!.title)
        }
      })
      stops.push(
        startAiVaultTabTitleSync({
          getState: store.getState,
          subscribe: store.subscribe,
          resolveSessionTitles: () => new Promise((resolve) => completions.push(resolve))
        })
      )
      await vi.waitFor(() => expect(completions).toHaveLength(1))
      if (change === 'host') {
        store.setState({ activeWorkspaceExecutionHostId: 'ssh:other-box' })
      } else if (change === 'generation') {
        store.setState((s) => ({
          tabsByWorktree: { workspace: [{ ...s.tabsByWorktree.workspace[0], generation: 1 }] }
        }))
      } else {
        store.setState((s) => ({
          terminalLayoutsByTabId: {
            tab: { ...s.terminalLayoutsByTabId.tab, ptyIdsByLeafId: { [LEAF]: 'new-pty' } }
          }
        }))
      }
      completions[0](nativeResult('Old binding response'))
      await vi.waitFor(() => expect(completions).toHaveLength(2))
      expect(writes).not.toContain('Old binding response')
      completions[1](nativeResult('Current binding response'))
      await vi.waitFor(() => expect(store.slot()?.title).toBe('Current binding response'))
    }
  )

  it('clears the previous host name even when the provider session id is equal', () => {
    const store = fixture()
    store.getState().setAiVaultTabTitle('tab', nativeResult('Name on old host').titles[0])
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: async () => ({ titles: [] })
      })
    )
    store.setState({ activeWorkspaceExecutionHostId: 'ssh:other-box' })
    expect(store.slot()?.title).not.toBe('Name on old host')
  })

  it('clears the old native slot when another provider is admitted on the same leaf', () => {
    const store = fixture()
    store.getState().setAiVaultTabTitle('tab', nativeResult('Name of Codex A').titles[0])
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: async () => ({ titles: [] })
      })
    )
    store.setState((s) => ({
      agentStatusByPaneKey: {
        [PANE]: {
          ...s.agentStatusByPaneKey[PANE],
          agentType: 'gemini',
          providerSession: { key: 'session_id', id: 'G' }
        }
      }
    }))
    expect(store.slot()?.title).not.toBe('Name of Codex A')
  })

  it('does not choose an arbitrary pane when a split has no selected leaf', () => {
    const store = fixture()
    store.setState((s) => ({
      terminalLayoutsByTabId: {
        tab: {
          ...s.terminalLayoutsByTabId.tab,
          activeLeafId: null,
          root: {
            type: 'split',
            direction: 'horizontal',
            first: { type: 'leaf', leafId: LEAF },
            second: { type: 'leaf', leafId: SIBLING }
          }
        }
      }
    }))
    expect(collectAiVaultTitleRequests(store.getState())).toEqual([])
  })

  it('rejects and clears a removed leaf even if activeLeafId is temporarily stale', () => {
    const store = fixture()
    store.getState().setAiVaultTabTitle('tab', nativeResult('Name of removed pane').titles[0])
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: async () => ({ titles: [] })
      })
    )
    store.setState((s) => ({
      terminalLayoutsByTabId: {
        tab: {
          ...s.terminalLayoutsByTabId.tab,
          root: { type: 'leaf', leafId: SIBLING }
        }
      }
    }))
    expect(collectAiVaultTitleRequests(store.getState())).toEqual([])
    expect(store.slot()?.title).not.toBe('Name of removed pane')
  })

  it('retains a known name when inventory becomes unavailable without replacement evidence', () => {
    const store = fixture()
    store.getState().setAiVaultTabTitle('tab', nativeResult('Known name').titles[0])
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: async () => ({ titles: [] })
      })
    )
    store.setState({ agentStatusByPaneKey: {} })
    expect(store.slot()?.title).toBe('Known name')
  })

  it('remembers ownership across missing inventory until a later explicit pane replacement', () => {
    const store = fixture()
    store.getState().setAiVaultTabTitle('tab', nativeResult('Known name').titles[0])
    stops.push(
      startAiVaultTabTitleSync({
        getState: store.getState,
        subscribe: store.subscribe,
        resolveSessionTitles: async () => ({ titles: [] })
      })
    )
    store.setState({ agentStatusByPaneKey: {} })
    expect(store.slot()?.title).toBe('Known name')
    store.setState((s) => ({
      terminalLayoutsByTabId: {
        tab: {
          ...s.terminalLayoutsByTabId.tab,
          activeLeafId: SIBLING,
          root: { type: 'leaf', leafId: SIBLING }
        }
      }
    }))
    expect(store.slot()?.title).not.toBe('Known name')
  })

  it('preserves the first prompt on same-session rename and accepts B prompt after replacement', () => {
    const store = fixture()
    store.setState({
      settings: { ...getDefaultSettings('/workspace'), tabAutoGenerateTitle: true }
    })
    store.getState().setAiVaultTabTitle('tab', nativeResult('Name of A').titles[0])
    store.getState().setGeneratedTabTitleFromAgentPrompt(PANE, 'Fix the authentication bug')
    const first = store.getState().tabsByWorktree.workspace[0].generatedTitle
    expect(first).toBe('Fix the authentication bug')
    store.getState().setAiVaultTabTitle('tab', nativeResult('Renamed A').titles[0])
    expect(store.getState().tabsByWorktree.workspace[0].generatedTitle).toBe(first)
    store.getState().setAiVaultTabTitle('tab', nativeResult('Name of B', 'B').titles[0])
    store.getState().setGeneratedTabTitleFromAgentPrompt(PANE, 'Repair the payment failure')
    expect(store.getState().tabsByWorktree.workspace[0].generatedTitle).toBe(
      'Repair the payment failure'
    )
    expect(store.getState().unifiedTabsByWorktree.workspace[0].generatedLabel).toBe(
      'Repair the payment failure'
    )
  })
})
